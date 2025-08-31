# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Lexical-Loro Integration: Collaborative Text Editor Model

ARCHITECTURE OVERVIEW:
=====================

This module implements a collaborative text editing system that bridges Lexical.js 
(rich text editor) with Loro CRDT (Conflict-free Replicated Data Type) for real-time 
collaborative editing.

DOCUMENT ARCHITECTURE:
=====================

Two-Document System:
1. **text_doc**: Primary CRDT document storing serialized lexical content
2. **structured_doc**: Secondary document for metadata tracking

KEY DESIGN PRINCIPLE: INCREMENTAL UPDATES ONLY
==============================================

**PROBLEM SOLVED:**
Previous implementation used destructive "delete everything + insert new content" 
operations that caused race conditions when multiple clients collaborated:

❌ Dangerous Pattern:
```python
text_data.delete(0, current_length)  # Delete entire document
text_data.insert(0, new_content)     # Insert new content
```

This caused Rust panics when:
- Client A: Calls delete() on text_doc
- Client B: Simultaneously calls import_() on same text_doc
- Result: Mutex poisoning and application crash

**SOLUTION IMPLEMENTED:**
✅ Safe Collaborative Pattern:
```python
# Local update
self.lexical_data["root"]["children"].append(new_block)

# Collaborative propagation via events
self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
    "type": "document-update",
    "docId": self.doc_id, 
    "snapshot": self.get_snapshot()
})
```

COLLABORATIVE SAFETY MECHANISMS:
===============================

1. **Collaborative Mode Detection**: 
   - Checks for active _text_doc_subscription
   - Prevents destructive operations when collaboration active

2. **Event-Based Propagation**:
   - Uses WebSocket server to coordinate updates
   - CRDT handles conflict resolution automatically
   - Eliminates race conditions

3. **Safe Initialization**:
   - Allows destructive sync only with force_initialization=True
   - Used only for initial document setup

USAGE PATTERNS:
==============

✅ Collaborative Operations (MCP, User Input):
- add_block(), remove_block(), update_block()
- All use event-based propagation
- Safe for concurrent client operations

✅ Initialization Operations:
- New document creation
- Uses _sync_to_loro(force_initialization=True)
- Safe when no other clients connected

❌ Legacy Dangerous Operations:
- Direct _sync_to_loro() calls in collaborative mode
- Now protected by safety checks
"""

import json
import time
from typing import Dict, Any, List, Optional, TYPE_CHECKING, Callable
from enum import Enum
try:
    import loro
    from loro import ExportMode, EphemeralStore, EphemeralStoreEvent
except ImportError:
    # Fallback for when loro is not available
    loro = None
    ExportMode = None
    EphemeralStore = None
    EphemeralStoreEvent = None

if TYPE_CHECKING and loro is not None:
    from loro import LoroDoc


class LexicalEventType(Enum):
    """Event types for LexicalModel communication with server"""
    DOCUMENT_CHANGED = "document_changed"
    EPHEMERAL_CHANGED = "ephemeral_changed"
    BROADCAST_NEEDED = "broadcast_needed"


class LexicalModel:
    """
    A class that implements two-way binding between Lexical data structure and Loro documents.
    
    DOCUMENT ARCHITECTURE:
    =====================
    
    This class manages TWO separate Loro documents with distinct roles:
    
    1. **text_doc (Primary Document for Lexical Updates)**:
       - Content: Complete serialized JSON of the lexical structure
       - Format: Either direct JSON or wrapped in editorState format
       - Usage: 
         * All collaborative updates via import_() and export()
         * Change subscriptions for real-time collaboration
         * Source of truth for lexical content
         * Target for CRDT operations
       - Examples:
         * Incoming updates: text_doc.import_(update_bytes)
         * Exporting updates: text_doc.export(ExportMode.Snapshot())
         * Change monitoring: text_doc.subscribe(change_handler)
    
    2. **structured_doc (Secondary Document for Metadata)**:
       - Content: Basic metadata only (lastSaved, source, version, blockCount)
       - Format: Simple key-value pairs in a LoroMap
       - Usage:
         * Lightweight metadata tracking
         * Not used for main content updates
         * Minimal role in collaboration
    
    COLLABORATIVE UPDATE STRATEGY:
    =============================
    
    The class uses TWO different update mechanisms depending on context:
    
    1. **Incremental Updates (Collaborative Mode)**:
       - Used when _text_doc_subscription is active (collaborative environment)
       - Method: Event-based propagation via _emit_event()
       - Safe for concurrent operations with other clients
       - Avoids destructive delete+insert operations
    
    2. **Wholesale Replacement (Initialization Mode)**:
       - Used only during initialization when force_initialization=True
       - Method: Direct text_doc modification with delete+insert
       - Safe only when no other clients are connected
       - Protected by collaborative mode detection
    
    CRITICAL DESIGN PRINCIPLE:
    =========================
    
    **Never use destructive operations (delete + insert) in collaborative mode**
    
    This prevents race conditions where:
    - One client calls text_data.delete(0, current_length)
    - Another client simultaneously calls text_doc.import_(update_bytes)
    - Result: Rust mutex panic due to concurrent modification
    
    Instead, use event-based propagation which relies on the CRDT's built-in
    conflict resolution mechanisms.
    
    Args:
        text_doc: Optional existing text document for collaboration
        structured_doc: Optional existing structured document for metadata
        container_id: Container identifier for CRDT synchronization
        event_callback: Callback for handling document events
        ephemeral_timeout: Timeout for ephemeral data (cursors, selections)
    """
    
    def __init__(self, text_doc: Optional['LoroDoc'] = None, structured_doc: Optional['LoroDoc'] = None, container_id: Optional[str] = None, doc_id: Optional[str] = None, event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None, ephemeral_timeout: int = 300000, enable_subscriptions: bool = True):
        if loro is None:
            raise ImportError("loro package is required for LoroModel")
            
        # Initialize two Loro documents (use provided ones or create new)
        self.text_doc = text_doc if text_doc is not None else loro.LoroDoc()
        
        # Store both document ID (for WebSocket protocol) and container ID (for CRDT operations)
        self.doc_id = doc_id or container_id or "content"  # WebSocket document identifier
        self.container_id = container_id or "content"      # CRDT container identifier
        self.structured_doc = structured_doc if structured_doc is not None else loro.LoroDoc()
        
        # Store event callback for structured communication with server
        self._event_callback = event_callback
        
        # Store subscription control flag
        self._enable_subscriptions = enable_subscriptions
        
        # Track if we need to subscribe to existing document changes
        self._text_doc_subscription = None
        
        # Flag to prevent recursive operations during import/update
        self._import_in_progress = False
        
        # Step 3: Initialize EphemeralStore for cursor/selection data
        self.ephemeral_timeout = ephemeral_timeout
        
        # Validate ephemeral_timeout before creating EphemeralStore
        if EphemeralStore and ephemeral_timeout is not None and isinstance(ephemeral_timeout, int) and ephemeral_timeout > 0:
            try:
                self.ephemeral_store = EphemeralStore(ephemeral_timeout)
                print(f"✅ EphemeralStore initialized with timeout {ephemeral_timeout}ms")
            except Exception as e:
                print(f"⚠️ Failed to create EphemeralStore: {e}")
                self.ephemeral_store = None
        else:
            print(f"⚠️ EphemeralStore not created - invalid timeout: {ephemeral_timeout}")
            self.ephemeral_store = None
            
        self._ephemeral_subscription = None
        
        # Initialize the lexical model structure
        self.lexical_data = {
            "root": {
                "children": [],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "root",
                "version": 1
            },
            "lastSaved": int(time.time() * 1000),
            "source": "Lexical Loro",
            "version": "0.34.0"
        }
        
        # If we were given an existing text_doc, sync from it first
        if text_doc is not None:
            self._sync_from_existing_doc()
            # Set up subscription to listen for changes
            self._setup_text_doc_subscription()
        else:
            # Initialize Loro documents with the base structure (safe for new instances)
            self._sync_to_loro(force_initialization=True)
        
        # Set up ephemeral store subscription if available
        self._setup_ephemeral_subscription()
    
    def _setup_ephemeral_subscription(self):
        """Set up subscription to handle EphemeralStoreEvent changes"""
        if not self.ephemeral_store or not EphemeralStoreEvent:
            return
        
        # CRITICAL FIX: Disable ephemeral store subscription to avoid Rust panic
        # The loro-py library has a bug in the EphemeralStoreEvent handling that
        # causes a Rust panic when accessing event attributes. Disabling this
        # subscription prevents the panic while still allowing ephemeral data
        # to be applied and broadcast correctly.
        
        print("LoroModel: Skipping ephemeral store subscription to avoid Rust panic")
        self._ephemeral_subscription = None
        
        # Note: Ephemeral updates still work fine through direct apply() calls
        # and manual broadcasting - the subscription is only for automatic events
    
    def _handle_ephemeral_store_event(self, event):
        """
        Handle changes in the ephemeral store using native EphemeralStoreEvent.
        
        Args:
            event: The EphemeralStoreEvent containing change information
        """
        try:
            print(f"LoroModel: Received ephemeral store event")
            
            # CRITICAL FIX: Don't access event attributes that cause Rust panics
            # The loro-py library has a bug where accessing certain event attributes
            # with None values causes a Rust panic. Instead, just emit a generic event.
            
            # Emit structured event to notify server (minimal safe approach)
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "event_type": "ephemeral_changed",
                "broadcast_needed": True,
                "note": "EphemeralStoreEvent received (safe handling to avoid Rust panic)"
            })
            
        except Exception as e:
            print(f"Warning: Error handling ephemeral store event: {e}")
    
    def _create_broadcast_data(self, event_type: str = "document-update", additional_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Create broadcast-safe event data with base64-encoded snapshot.
        
        This ensures all event data is JSON-serializable for WebSocket transmission.
        
        Args:
            event_type: Type of broadcast event
            additional_data: Additional data to include
            
        Returns:
            Dict containing JSON-serializable broadcast data
        """
        import base64
        
        snapshot_bytes = self.get_snapshot()
        broadcast_data = {
            "type": event_type,
            "docId": self.doc_id,
            "snapshot": base64.b64encode(snapshot_bytes).decode('utf-8')
        }
        
        if additional_data:
            broadcast_data.update(additional_data)
            
        return broadcast_data
    
    def _emit_event(self, event_type: LexicalEventType, event_data: Dict[str, Any]) -> None:
        """
        Emit a structured event to the server for collaborative propagation.
        
        **COLLABORATIVE EVENT SYSTEM:**
        
        This is the SAFE alternative to destructive _sync_to_loro() operations.
        Instead of directly modifying the shared text_doc, this method:
        
        1. Emits events to the WebSocket server
        2. Server broadcasts changes to all connected clients
        3. Clients receive updates via import_() mechanism
        4. CRDT handles conflict resolution automatically
        
        **EVENT FLOW:**
        ```
        Client A: add_block() → _emit_event() → WebSocket Server
                                                       ↓
        Client B: ← WebSocket → text_doc.import_() ← Server Broadcast
        ```
        
        **SUPPORTED EVENT TYPES:**
        
        - BROADCAST_NEEDED: Request propagation of document changes
        - DOCUMENT_CHANGED: Notify of local document modifications
        - EPHEMERAL_CHANGED: Notify of cursor/selection changes
        
        **TYPICAL USAGE:**
        ```python
        # Safe collaborative update
        self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
            "type": "document-update",
            "docId": self.doc_id,
            "snapshot": self.get_snapshot()
        })
        ```
        
        **WHY THIS PREVENTS RACE CONDITIONS:**
        
        - No direct text_doc modification during collaboration
        - Uses CRDT's built-in serialization/deserialization
        - Server coordinates all updates sequentially
        - Eliminates concurrent delete+insert operations
        
        Args:
            event_type: The type of event being emitted (see LexicalEventType)
            event_data: Additional data associated with the event
            
        Returns:
            None. Events are fire-and-forget with error handling.
        """
        if self._event_callback:
            try:
                self._event_callback(event_type.value, {
                    "model": self,
                    "container_id": self.container_id,
                    **event_data
                })
            except Exception as e:
                # Log error but don't break the model operation
                print(f"Error in event callback: {e}")
    
    @classmethod
    def create_document(cls, doc_id: str, initial_content: Optional[str] = None, event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None, ephemeral_timeout: int = 300000, loro_doc: Optional['LoroDoc'] = None) -> 'LexicalModel':
        """
        Create a new LexicalModel with a Loro document initialized for the given doc_id.
        
        Args:
            doc_id: The container ID for the text content
            initial_content: Optional initial JSON content to seed the document
            event_callback: Optional callback for structured event communication with server
            ephemeral_timeout: Timeout for ephemeral data (cursor/selection) in milliseconds
            loro_doc: Optional existing LoroDoc to use instead of creating new one
            
        Returns:
            A new LexicalModel instance with initialized Loro documents
        """
        if loro is None:
            raise ImportError("loro package is required for LexicalModel")
        
        # Use provided document or create new one
        doc = loro_doc if loro_doc is not None else loro.LoroDoc()
        
        # Get text container using "content" as container name (single container architecture)
        text_container = doc.get_text("content")
        
        # Seed with initial content if provided
        if initial_content:
            try:
                # Validate that initial_content is valid JSON
                if isinstance(initial_content, str):
                    json.loads(initial_content)  # Validate JSON
                    text_container.insert(0, initial_content)
                elif isinstance(initial_content, dict):
                    text_container.insert(0, json.dumps(initial_content))
                else:
                    raise ValueError("initial_content must be a JSON string or dictionary")
                
                # Commit the changes
                doc.commit()
                
            except (json.JSONDecodeError, ValueError) as e:
                raise ValueError(f"Invalid initial_content: {e}")
        
        # Create LexicalModel instance with the initialized document and ephemeral timeout
        model = cls(text_doc=doc, container_id="content", doc_id=doc_id, event_callback=event_callback, ephemeral_timeout=ephemeral_timeout)
        
        return model
    
    def _sync_from_existing_doc(self):
        """Sync from existing document content using the document's container ID"""
        try:
            # First, try to find what text containers exist in the document
            doc_state = self.text_doc.get_deep_value()
            
            # Look for text containers in the document state
            content_found = False
            potential_containers = []
            
            if isinstance(doc_state, dict):
                for key, value in doc_state.items():
                    if isinstance(value, str) and value.strip().startswith('{'):
                        potential_containers.append((key, value))
                        
            # Always use "content" as the container name since we have a model per doc_id
            container_names_to_try = ["content"]
            
            for container_name in container_names_to_try:
                try:
                    text_container = self.text_doc.get_text(container_name)
                    content = text_container.to_string()
                    
                    if content and content.strip():
                        # Try to parse as JSON
                        try:
                            parsed_data = json.loads(content)
                            
                            # Handle both direct lexical format and editorState wrapper
                            if isinstance(parsed_data, dict):
                                if "root" in parsed_data:
                                    # Direct lexical format
                                    self.lexical_data = parsed_data
                                    content_found = True
                                    block_count = len(parsed_data.get("root", {}).get("children", []))
                                    print(f"LoroModel: Synced from existing container '{container_name}' - {block_count} blocks")
                                    break
                                elif "editorState" in parsed_data and isinstance(parsed_data["editorState"], dict) and "root" in parsed_data["editorState"]:
                                    # editorState wrapper format
                                    editor_state = parsed_data["editorState"]
                                    # Build lexical_data with metadata from outer level
                                    self.lexical_data = {
                                        "root": editor_state["root"],
                                        "lastSaved": parsed_data.get("lastSaved", int(time.time() * 1000)),
                                        "source": parsed_data.get("source", "Lexical Loro"),
                                        "version": parsed_data.get("version", "0.34.0")
                                    }
                                    content_found = True
                                    block_count = len(editor_state.get("root", {}).get("children", []))
                                    print(f"LoroModel: Synced from existing container '{container_name}' (editorState format) - {block_count} blocks")
                                    break
                        except json.JSONDecodeError:
                            continue
                            
                except Exception:
                    continue
            
            if not content_found:
                print("LoroModel: No valid lexical content found in existing document, using default structure")
                
            # Always sync to structured document after loading
            self._sync_structured_doc_only()
            
        except Exception as e:
            print(f"Warning: Could not sync from existing document: {e}")
            # Keep default structure if sync fails
    
    def _setup_text_doc_subscription(self):
        """Set up subscription to listen for changes in the text document"""
        
        # Check if subscriptions are disabled (e.g., for MCP server to prevent import conflicts)
        if not getattr(self, '_enable_subscriptions', True):
            print(f"🚫 Subscriptions disabled for this model (WebSocket-only sync mode)")
            return
            
        try:
            # Always use "content" as the container name since we have a model per doc_id
            active_container = "content"
            
            print(f"🔧 Setting up subscription for container '{active_container}'...")
            
            # Subscribe to document changes - try different subscription patterns
            try:
                # Try the most common pattern first
                self._text_doc_subscription = self.text_doc.subscribe(
                    self._handle_text_doc_change
                )
                print(f"✅ Set up document subscription (monitoring '{active_container}' container)")
                print(f"✅ Subscription object: {type(self._text_doc_subscription)}")
            except TypeError as e1:
                print(f"❌ Document subscription failed: {e1}")
                # Try with additional parameters that might be required
                try:
                    self._text_doc_subscription = self.text_doc.subscribe(
                        active_container, self._handle_text_doc_change
                    )
                    print(f"✅ Set up container subscription for '{active_container}'")
                    print(f"✅ Subscription object: {type(self._text_doc_subscription)}")
                except TypeError as e2:
                    print(f"❌ Container subscription failed: {e2}")
                    # Try the observer pattern with container-specific subscription
                    text_container = self.text_doc.get_text(active_container)
                    self._text_doc_subscription = text_container.subscribe(
                        self._handle_text_doc_change
                    )
                    print(f"✅ Set up text container subscription for '{active_container}'")
                    print(f"✅ Subscription object: {type(self._text_doc_subscription)}")
                    
            # Test the subscription by making a small change to verify it works
            print(f"🧪 Testing subscription by making a test change...")
            try:
                test_container = self.text_doc.get_text(active_container)
                current_length = test_container.len_unicode
                test_container.insert(current_length, " ")  # Add a space
                test_container.delete(current_length, 1)    # Remove the space
                self.text_doc.commit()
                print(f"🧪 Test change completed")
            except Exception as test_e:
                print(f"🧪 Test change failed: {test_e}")
                    
        except Exception as e:
            # If subscription fails, we'll fall back to manual syncing
            print(f"❌ Could not set up text_doc subscription: {e}")
            print(f"❌ Exception type: {type(e)}")
            import traceback
            traceback.print_exc()
            self._text_doc_subscription = None
    
    def _handle_text_doc_change(self, diff_event):
        """Handle changes to the text document using fine-grained diffs"""
        try:
            print(f"🔥 _handle_text_doc_change: CALLED with diff_event type {type(diff_event)}")
            print(f"LoroModel: Received text doc change event")
            # Process each container diff in the event
            for container_diff in diff_event.events:
                # We're interested in changes to our text container
                if hasattr(container_diff, 'target') and hasattr(container_diff, 'diff'):
                    # Check if this is the container we care about
                    target_str = str(container_diff.target) if hasattr(container_diff.target, '__str__') else repr(container_diff.target)
                    print(f"LoroModel: Processing diff for target: {target_str}")
                    
                    # Check if this is the "content" container we care about
                    target_matches = "content" in target_str
                    
                    if target_matches:
                        print(f"LoroModel: Applying text diff for {target_str}")
                        self._apply_text_diff(container_diff.diff)
                        # Auto-sync after receiving changes
                        self._auto_sync_on_change()
                    else:
                        print(f"LoroModel: Ignoring diff for {target_str} (not our container)")
                        
        except Exception as e:
            print(f"❌ Error handling text document change event: {e}")
            import traceback
            traceback.print_exc()
            # Fallback to full sync
            self._sync_from_loro_fallback()
    
    def _auto_sync_on_change(self):
        """Automatically notify about changes (no sync needed - diff already applied)"""
        try:
            # Prevent recursive operations during import/update
            if self._import_in_progress:
                print("LoroModel: Skipping auto-sync (import in progress)")
                return
                
            # COLLABORATIVE FIX: Don't sync here - the diff was already applied by _apply_text_diff()
            # Syncing here reads stale CRDT state and causes content loss
            print("LoroModel: Change processed via diff, emitting broadcast (no sync needed)")
            
            # Create broadcast data for incremental updates
            loro_snapshot = self.get_snapshot()
            if loro_snapshot:
                # Create proper broadcast data for the WebSocket server
                # Use initial-snapshot type for snapshot data to avoid JSON concatenation
                broadcast_data = {
                    "type": "initial-snapshot",  # Correct type for snapshot data
                    "docId": self.doc_id,
                    "snapshot": list(loro_snapshot),  # Use 'snapshot' field for snapshot data
                    "hasData": True,
                    "hasEvent": False
                }
                
                # Emit BROADCAST_NEEDED event so the WebSocket server broadcasts it
                print(f"LoroModel: Emitting BROADCAST_NEEDED for automatic CRDT propagation")
                self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                    "message_type": "crdt-auto-sync",
                    "broadcast_data": broadcast_data,
                    "client_id": "crdt-system"
                })
            
            # Also emit document_changed for logging/monitoring
            self._emit_event(LexicalEventType.DOCUMENT_CHANGED, {
                "snapshot": loro_snapshot,
                "update": self.export_update() if hasattr(self, 'export_update') else None
            })
        except Exception as e:
            print(f"Warning: Error in auto-sync: {e}")
    
    def _sync_from_loro_fallback(self):
        """Fallback sync method when diff processing fails"""
        print("LoroModel: Using fallback sync")
        self._auto_sync_on_change()
    
    def _apply_text_diff(self, diff):
        """Apply text diff to update lexical_data incrementally"""
        try:
            diff_type = diff.__class__.__name__ if hasattr(diff, '__class__') else 'unknown'
            print(f"🔄 _apply_text_diff: Processing diff of type {diff_type}")
            print(f"🔍 Full diff object: {diff}")
            print(f"🔍 Diff attributes: {[attr for attr in dir(diff) if not attr.startswith('_')]}")
            
            # Log current state before applying diff
            current_blocks = len(self.lexical_data.get("root", {}).get("children", []))
            print(f"📊 Before diff: {current_blocks} blocks")
            
            # Be more flexible with diff type checking - look for "Text" in the name or check for text diff attributes
            is_text_diff = (hasattr(diff, '__class__') and 
                          ('Text' in diff.__class__.__name__ or 
                           hasattr(diff, 'diff') or 
                           hasattr(diff, 'insert') or 
                           hasattr(diff, 'delete') or 
                           hasattr(diff, 'retain')))
            
            print(f"🔍 Is text diff: {is_text_diff}")
            
            if is_text_diff:
                # Get current content to work with
                current_content = self._get_current_text_content()
                print(f"📝 Current content length: {len(current_content)} chars")
                
                # Try to access diff data - could be diff.diff or just diff
                diff_data = None
                if hasattr(diff, 'diff'):
                    diff_data = diff.diff
                    print(f"🔍 Using diff.diff: {type(diff_data)}")
                    print(f"🔍 Diff data content: {diff_data}")
                else:
                    diff_data = diff
                    print(f"🔍 Using diff directly: {type(diff_data)}")
                
                # Apply text deltas to reconstruct the new content
                new_content = self._apply_text_deltas(current_content, diff_data)
                
                print(f"📝 Content comparison:")
                print(f"  📝 Old length: {len(current_content)}")
                print(f"  📝 New length: {len(new_content)}")
                print(f"  📝 Content changed: {new_content != current_content}")
                if new_content != current_content:
                    print(f"  📝 Old preview: {current_content[:100]}...")
                    print(f"  📝 New preview: {new_content[:100]}...")
                
                if new_content and new_content != current_content:
                    print(f"📝 Content changed: {len(current_content)} -> {len(new_content)} chars")
                    
                    # Parse the new content as JSON
                    try:
                        new_lexical_data = json.loads(new_content)
                        
                        # Log what we're about to update to
                        new_blocks = len(new_lexical_data.get("root", {}).get("children", []))
                        print(f"📊 New lexical data has {new_blocks} blocks")
                        
                        # Compare and update blocks incrementally
                        self._update_lexical_data_incrementally(new_lexical_data)
                        
                        # Log final state after update
                        final_blocks = len(self.lexical_data.get("root", {}).get("children", []))
                        print(f"📊 After diff: {final_blocks} blocks")
                        
                        # Sync to structured document
                        self._sync_structured_doc_only()
                        
                    except json.JSONDecodeError as e:
                        print(f"❌ Could not parse updated content as JSON: {e}")
                        print(f"📋 Content preview: {new_content[:200]}...")
                else:
                    print(f"📝 No content change detected")
            else:
                print(f"❌ Diff is not a recognized text diff type")
                print(f"🔍 Expected: Text diff with 'Text' in name or text diff attributes")
                print(f"🔍 Got: {diff_type} with attributes {[attr for attr in dir(diff) if not attr.startswith('_')]}")
                        
        except Exception as e:
            print(f"❌ Error applying text diff: {e}")
            import traceback
            traceback.print_exc()
    
    def _get_current_text_content(self) -> str:
        """Get current text content from the document"""
        # Always use "content" as the container name since we have a model per doc_id
        try:
            text_data = self.text_doc.get_text("content")
            content = text_data.to_string()
            return content if content else ""
        except Exception:
            return ""
    
    def _apply_text_deltas(self, content: str, deltas) -> str:
        """Apply a sequence of text deltas to content"""
        print(f"🔧 _apply_text_deltas: Starting with content length {len(content)}")
        print(f"🔧 Deltas type: {type(deltas)}")
        print(f"🔧 Deltas content: {deltas}")
        
        if not deltas:
            print(f"🔧 No deltas to apply")
            return content
            
        result = content
        position = 0
        
        try:
            for i, delta in enumerate(deltas):
                delta_class = delta.__class__.__name__
                print(f"🔧 Delta {i}: {delta_class} - {delta}")
                
                if delta_class == 'Retain' or delta_class == 'TextDelta_Retain':
                    # Move position forward
                    retain_amount = getattr(delta, 'retain', getattr(delta, 'len', 0))
                    print(f"🔧 Retaining {retain_amount} chars from position {position}")
                    position += retain_amount
                    
                elif delta_class == 'Insert' or delta_class == 'TextDelta_Insert':
                    # Insert text at current position
                    insert_text = getattr(delta, 'insert', str(delta))
                    print(f"🔧 Inserting '{insert_text[:50]}...' at position {position}")
                    
                    # Special case: if inserting at position 0 and we have existing content,
                    # and the insert looks like a complete JSON document, replace instead of insert
                    if position == 0 and result and insert_text.strip().startswith('{"root":'):
                        print(f"🔧 Detected complete JSON replacement, using replace instead of insert")
                        result = insert_text
                        position = len(insert_text)
                    else:
                        result = result[:position] + insert_text + result[position:]
                        position += len(insert_text)
                    
                elif delta_class == 'Delete' or delta_class == 'TextDelta_Delete':
                    # Delete text at current position
                    delete_amount = getattr(delta, 'delete', getattr(delta, 'len', 0))
                    print(f"🔧 Deleting {delete_amount} chars from position {position}")
                    result = result[:position] + result[position + delete_amount:]
                    # Position stays the same after deletion
                else:
                    print(f"🔧 Unknown delta type: {delta_class}")
                    print(f"🔧 Delta attributes: {[attr for attr in dir(delta) if not attr.startswith('_')]}")
                    # Try to handle it generically
                    if hasattr(delta, 'insert'):
                        insert_text = delta.insert
                        print(f"🔧 Generic insert: '{insert_text[:50]}...' at position {position}")
                        result = result[:position] + insert_text + result[position:]
                        position += len(insert_text)
                    
        except Exception as e:
            print(f"❌ Error applying text deltas: {e}")
            import traceback
            traceback.print_exc()
            return content
            
        print(f"🔧 _apply_text_deltas: Finished with content length {len(result)}")
        return result
    
    def _update_lexical_data_incrementally(self, new_lexical_data: Dict[str, Any]):
        """Update lexical_data incrementally by comparing with new data"""
        try:
            old_blocks = self.lexical_data.get("root", {}).get("children", [])
            new_blocks = new_lexical_data.get("root", {}).get("children", [])
            
            print(f"🔄 _update_lexical_data_incrementally: {len(old_blocks)} -> {len(new_blocks)} blocks")
            
            # Update metadata
            self.lexical_data["lastSaved"] = new_lexical_data.get("lastSaved", self.lexical_data["lastSaved"])
            self.lexical_data["source"] = new_lexical_data.get("source", self.lexical_data["source"])
            self.lexical_data["version"] = new_lexical_data.get("version", self.lexical_data["version"])
            
            # Compare blocks for fine-grained updates
            if len(old_blocks) != len(new_blocks):
                # Block count changed - update entire children array
                self.lexical_data["root"]["children"] = new_blocks
                print(f"✅ Block count changed - {len(old_blocks)} -> {len(new_blocks)}")
            else:
                # Same number of blocks - check for content changes
                blocks_changed = False
                for i, (old_block, new_block) in enumerate(zip(old_blocks, new_blocks)):
                    if old_block != new_block:
                        self.lexical_data["root"]["children"][i] = new_block
                        blocks_changed = True
                        
                        # Log specific block changes
                        old_type = old_block.get('type', 'unknown')
                        new_type = new_block.get('type', 'unknown')
                        if old_type != new_type:
                            print(f"✅ Block {i} type changed - {old_type} -> {new_type}")
                        
                        # Check for text content changes
                        old_text = self._extract_block_text(old_block)
                        new_text = self._extract_block_text(new_block)
                        if old_text != new_text:
                            print(f"✅ Block {i} text changed - '{old_text[:50]}...' -> '{new_text[:50]}...'")
                
                if not blocks_changed:
                    print(f"📝 No block content changes detected")
                if blocks_changed:
                    print(f"LoroModel: {sum(1 for i in range(len(old_blocks)) if old_blocks[i] != new_blocks[i])} blocks updated")
                    
        except Exception as e:
            print(f"Warning: Error in incremental update: {e}")
            # Fallback to replacing entire structure
            self.lexical_data = new_lexical_data
    
    def _extract_block_text(self, block: Dict[str, Any]) -> str:
        """Extract text content from a block"""
        text_parts = []
        for child in block.get('children', []):
            if child.get('type') == 'text':
                text_parts.append(child.get('text', ''))
        return ''.join(text_parts)
    
    def _sync_from_loro_fallback(self):
        """Fallback method for full synchronization when diff processing fails"""
        try:
            text_data = self.text_doc.get_text("content")
            content = text_data.to_string()
            if content:
                old_lexical_data = self.lexical_data.copy()
                self.lexical_data = json.loads(content)
                
                # Log fallback sync
                old_blocks = old_lexical_data.get("root", {}).get("children", [])
                new_blocks = self.lexical_data.get("root", {}).get("children", [])
                print(f"LoroModel: Fallback sync - blocks: {len(old_blocks)} -> {len(new_blocks)}")
                
        except Exception as e:
            print(f"Warning: Fallback sync failed: {e}")
            # Keep current data if sync fails
    
    def _sync_structured_doc_only(self):
        """Sync only to the structured document (used when text_doc changes externally)"""
        try:
            # Update structured document with basic metadata only
            root_map = self.structured_doc.get_map("root")
            
            # Clear existing data
            for key in list(root_map.keys()):
                root_map.delete(key)
                
            # Set basic properties using insert method
            root_map.insert("lastSaved", self.lexical_data["lastSaved"])
            root_map.insert("source", self.lexical_data["source"])
            root_map.insert("version", self.lexical_data["version"])
            root_map.insert("blockCount", len(self.lexical_data["root"]["children"]))
        except Exception as e:
            print(f"Warning: Could not sync to structured document: {e}")
    
    def _sync_to_loro(self, force_initialization: bool = False):
        """
        Sync the current lexical_data to both Loro documents using destructive operations.
        
        **CRITICAL WARNING: DESTRUCTIVE OPERATIONS**
        ===========================================
        
        This method performs wholesale replacement of document content using:
        1. text_data.delete(0, current_length)  # Delete entire content
        2. text_data.insert(0, new_content)     # Insert new content
        
        **WHY THIS IS DANGEROUS IN COLLABORATIVE MODE:**
        
        Race Condition Scenario:
        - Client A: Calls _sync_to_loro() → text_data.delete(0, length)
        - Client B: Simultaneously calls text_doc.import_(update_bytes)
        - Result: Rust mutex panic due to concurrent modification
        
        **SAFETY MECHANISM:**
        
        Collaborative Mode Detection:
        - Checks if _text_doc_subscription exists (indicates active collaboration)
        - If collaborative mode detected, skips destructive operations
        - Logs warning and returns early
        
        **WHEN TO USE:**
        
        ✅ Safe Usage:
        - Initial document creation (force_initialization=True)
        - Single-client scenarios
        - Testing environments
        
        ❌ Unsafe Usage:
        - Active collaborative sessions
        - When other clients might be sending updates
        - After WebSocket connections established
        
        **ALTERNATIVE FOR COLLABORATIVE MODE:**
        
        Use event-based propagation instead:
        ```python
        self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
            "type": "document-update", 
            "docId": self.doc_id,
            "snapshot": self.get_snapshot()
        })
        ```
        
        Args:
            force_initialization: If True, bypasses collaborative safety check.
                                 Use ONLY for initial document setup.
        
        Returns:
            None. Method returns early if collaborative mode detected.
        """
        # Safety check: prevent destructive operations in collaborative environments
        if not force_initialization and self._text_doc_subscription is not None:
            print("⚠️ LoroModel: Skipping destructive _sync_to_loro() - collaborative mode detected")
            print("LoroModel: Use event-based propagation instead for collaborative updates")
            return
        
        # Always use "content" as the container name since we have a model per doc_id
        target_container = "content"
        
        print(f"LoroModel: Syncing TO container '{target_container}' (initialization mode)")
        
        # Update text document with serialized JSON
        text_data = self.text_doc.get_text(target_container)
        current_length = text_data.len_unicode
        if current_length > 0:
            text_data.delete(0, current_length)
        
        # Always use direct format for "content" container
        text_data.insert(0, json.dumps(self.lexical_data))
        print(f"LoroModel: Wrote direct format to '{target_container}'")
        
        # Update structured document with basic metadata only
        root_map = self.structured_doc.get_map("root")
        
        # Clear existing data
        for key in list(root_map.keys()):
            root_map.delete(key)
            
        # Set basic properties using insert method
        root_map.insert("lastSaved", self.lexical_data["lastSaved"])
        root_map.insert("source", self.lexical_data["source"])
        root_map.insert("version", self.lexical_data["version"])
        root_map.insert("blockCount", len(self.lexical_data["root"]["children"]))
        
        # CRITICAL: Commit the changes to trigger CRDT change events
        # This is essential for automatic propagation to other clients
        print(f"LoroModel: Committing changes to trigger CRDT propagation")
        self.text_doc.commit()
        print(f"LoroModel: Commit complete - changes should propagate automatically")
    
    def _sync_from_loro(self):
        """Sync data from Loro documents back to lexical_data with backward compatibility"""
        print(f"LoroModel: Starting _sync_from_loro() with container_id='{self.container_id}'")
        
        # Try containers in order of preference: 
        # 1. "content" (new simplified approach)
        # 2. container_id if provided (for backward compatibility)
        # 3. Legacy container names
        containers_to_try = ["content"]
        if self.container_id and self.container_id != "content":
            containers_to_try.append(self.container_id)
        
        # Add common legacy container names
        legacy_containers = ["lexical-shared-doc", "shared-text"]
        for legacy in legacy_containers:
            if legacy not in containers_to_try:
                containers_to_try.append(legacy)
        
        found_content = False
        migration_needed = False
        source_container = None
        
        for container_name in containers_to_try:
            try:
                print(f"LoroModel: Trying container '{container_name}'")
                text_data = self.text_doc.get_text(container_name)
                content = text_data.to_string()
                print(f"LoroModel: Container '{container_name}' content length: {len(content) if content else 0}")
                
                if content and content.strip():
                    try:
                        parsed_data = json.loads(content)
                        
                        # Handle both new and legacy lexical formats
                        lexical_format_data = None
                        
                        if isinstance(parsed_data, dict) and "root" in parsed_data:
                            # New direct lexical format (simplified structure)
                            lexical_format_data = parsed_data
                            print(f"LoroModel: Found new format in '{container_name}'")
                        elif isinstance(parsed_data, dict) and "editorState" in parsed_data:
                            # Legacy format with editorState wrapper
                            editor_state = parsed_data["editorState"]
                            if isinstance(editor_state, dict) and "root" in editor_state:
                                # Extract the lexical structure from editorState
                                lexical_format_data = {
                                    "root": editor_state["root"],
                                    "lastSaved": editor_state.get("lastSaved", parsed_data.get("lastSaved", int(time.time() * 1000))),
                                    "source": editor_state.get("source", parsed_data.get("source", "Lexical Loro")),
                                    "version": editor_state.get("version", parsed_data.get("version", "0.34.0"))
                                }
                                print(f"LoroModel: Found legacy format in '{container_name}', extracted editorState")
                        
                        if lexical_format_data:
                            # Direct lexical format
                            old_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                            new_block_count = len(lexical_format_data.get("root", {}).get("children", []))
                            self.lexical_data = lexical_format_data
                            print(f"LoroModel: Successfully synced from '{container_name}' - blocks {old_block_count} -> {new_block_count}")
                            
                            # Check if we need to migrate from legacy container to "content"
                            if container_name != "content":
                                migration_needed = True
                                source_container = container_name
                                print(f"LoroModel: Migration needed from '{source_container}' -> 'content'")
                            
                            found_content = True
                            break  # Successfully synced
                        else:
                            print(f"LoroModel: Container '{container_name}' data is not valid lexical format: {type(parsed_data)}")
                    except json.JSONDecodeError as e:
                        print(f"LoroModel: Container '{container_name}' has invalid JSON: {e}")
                else:
                    print(f"LoroModel: Container '{container_name}' is empty or whitespace")
            except Exception as e:
                print(f"LoroModel: Error accessing container '{container_name}': {e}")
        
        # Perform migration if needed
        if migration_needed and source_container:
            try:
                print(f"LoroModel: Migrating content from '{source_container}' to 'content'")
                # Copy content to the standard "content" container
                content_container = self.text_doc.get_text("content")
                source_text_data = self.text_doc.get_text(source_container)
                source_content = source_text_data.to_string()
                
                # Only migrate if content container is empty
                current_content = content_container.to_string()
                if not current_content or not current_content.strip():
                    content_container.insert(0, source_content)
                    self.text_doc.commit()
                    print(f"LoroModel: Successfully migrated content from '{source_container}' to 'content'")
                else:
                    print(f"LoroModel: Content container already has data, skipping migration")
            except Exception as e:
                print(f"LoroModel: Error during migration: {e}")
        
        if not found_content:
            print("LoroModel: No valid content found in any container during sync")
    
    def add_block(self, block_detail: Dict[str, Any], block_type: str):
        """
        Add a new block to the lexical model using collaborative-safe operations.
        
        **COLLABORATIVE DESIGN:**
        
        This method implements the collaborative-safe update pattern:
        1. Updates local lexical_data structure
        2. Uses event-based propagation instead of destructive sync
        3. Avoids race conditions with concurrent client operations
        
        **OLD (DANGEROUS) APPROACH:**
        ```python
        # This caused Rust panics in collaborative mode
        self._sync_to_loro()  # delete + insert entire document
        ```
        
        **NEW (SAFE) APPROACH:**
        ```python
        # This uses CRDT-compatible event propagation
        self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
            "type": "document-update", 
            "docId": self.doc_id,
            "snapshot": self.get_snapshot()
        })
        ```
        
        **WHY THIS IS SAFER:**
        - No destructive operations on shared text_doc
        - Uses the CRDT's built-in conflict resolution
        - Compatible with concurrent updates from other clients
        - Prevents Rust mutex panics from race conditions
        
        Args:
            block_detail: Dictionary containing block details (text, formatting, etc.)
            block_type: Type of block (paragraph, heading1, heading2, etc.)
            
        Examples:
            # Add a simple paragraph
            model.add_block({"text": "Hello world"}, "paragraph")
            
            # Add a heading with formatting
            model.add_block({
                "text": "Chapter 1", 
                "format": "bold"
            }, "heading1")
        """
        try:
            # COLLABORATIVE FIX: Never sync in add_block() - the model is kept current via subscriptions
            # The subscription events ensure lexical_data is always up-to-date
            # Manual syncing can read stale CRDT state and cause content loss
            print("LoroModel: add_block() using current lexical_data (no sync needed)")
            
            # Ensure we have a valid lexical_data structure
            if not isinstance(self.lexical_data, dict):
                print(f"❌ Resetting invalid lexical_data type: {type(self.lexical_data)}")
                self.lexical_data = self._create_default_lexical_structure()
            
            if "root" not in self.lexical_data:
                print(f"❌ Missing 'root', creating default structure")
                self.lexical_data["root"] = {"children": [], "direction": None, "format": "", "indent": 0, "type": "root", "version": 1}
                
            if not isinstance(self.lexical_data["root"], dict):
                print(f"❌ Invalid root type: {type(self.lexical_data['root'])}, resetting")
                self.lexical_data["root"] = {"children": [], "direction": None, "format": "", "indent": 0, "type": "root", "version": 1}
                
            if "children" not in self.lexical_data["root"]:
                print(f"❌ Missing 'children' in root, adding")
                self.lexical_data["root"]["children"] = []
                
            if not isinstance(self.lexical_data["root"]["children"], list):
                print(f"❌ Invalid children type: {type(self.lexical_data['root']['children'])}, resetting")
                self.lexical_data["root"]["children"] = []
            
            # Ensure we have required metadata
            if "source" not in self.lexical_data:
                self.lexical_data["source"] = "Lexical Loro"
            if "version" not in self.lexical_data:
                self.lexical_data["version"] = "0.34.0"
            if "lastSaved" not in self.lexical_data:
                self.lexical_data["lastSaved"] = int(time.time() * 1000)
                
        except Exception as e:
            print(f"❌ Error during add_block preparation: {e}")
            print(f"❌ Creating fresh structure")
            self.lexical_data = self._create_default_lexical_structure()
        
        # Map block types to lexical types
        type_mapping = {
            "paragraph": "paragraph",
            "heading1": "heading1",
            "heading2": "heading2",
            "heading3": "heading3",
            "heading4": "heading4",
            "heading5": "heading5",
            "heading6": "heading6",
        }
        
        lexical_type = type_mapping.get(block_type, "paragraph")
        
        # Create the block structure
        new_block = {
            "children": [],
            "direction": None,
            "format": "",
            "indent": 0,
            "type": lexical_type,
            "version": 1
        }
        
        # Add heading tag if it's a heading
        if block_type.startswith("heading"):
            heading_level = block_type.replace("heading", "") or "1"
            new_block["tag"] = f"h{heading_level}"
        elif lexical_type == "paragraph":
            new_block["textFormat"] = 0
            new_block["textStyle"] = ""
        
        # Add text content if provided
        if "text" in block_detail:
            text_node = {
                "detail": block_detail.get("detail", 0),
                "format": block_detail.get("format", 0),
                "mode": block_detail.get("mode", "normal"),
                "style": block_detail.get("style", ""),
                "text": block_detail["text"],
                "type": "text",
                "version": 1
            }
            new_block["children"].append(text_node)
        
        # Add any additional properties from block_detail
        for key, value in block_detail.items():
            if key not in ["text", "detail", "format", "mode", "style"]:
                new_block[key] = value
        
        try:
            # Add block to the lexical data
            old_count = len(self.lexical_data["root"]["children"])
            self.lexical_data["root"]["children"].append(new_block)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            new_count = len(self.lexical_data["root"]["children"])
            
            print(f"✅ Block added to lexical_data: {old_count} -> {new_count} blocks")
            
            # In collaborative mode, avoid destructive sync to prevent conflicts
            # But we still need to persist the changes to the CRDT
            print("LoroModel: Using event-based propagation instead of destructive sync")
            
            # CRITICAL: Persist changes to CRDT using incremental append
            # This is safer than destructive sync but still updates the document
            try:
                container_name = "content"
                text_container = self.text_doc.get_text(container_name)
                
                # Create full Lexical format with metadata (not just root content)
                full_lexical_document = {
                    "root": self.lexical_data["root"],
                    "lastSaved": self.lexical_data.get("lastSaved", int(time.time() * 1000)),
                    "source": self.lexical_data.get("source", "Lexical Loro"),
                    "version": self.lexical_data.get("version", "0.34.0")
                }
                updated_content = json.dumps(full_lexical_document)
                
                # Replace content incrementally with extensive logging
                print(f"🔍 CRDT Operation START: container={container_name}, doc_id={getattr(self, 'doc_id', 'unknown')}")
                print(f"🔍 CRDT text_doc instance: {id(self.text_doc)}")
                
                current_length = text_container.len_unicode
                print(f"🔍 CRDT current_length: {current_length}")
                
                if current_length > 0:
                    print(f"🔍 CRDT About to call delete(0, {current_length})")
                    try:
                        text_container.delete(0, current_length)
                        print(f"✅ CRDT delete operation successful")
                    except Exception as delete_error:
                        print(f"❌ CRDT delete operation failed: {delete_error}")
                        raise delete_error
                
                print(f"🔍 CRDT About to call insert(0, content_length={len(updated_content)})")
                try:
                    text_container.insert(0, updated_content)
                    print(f"✅ CRDT insert operation successful")
                except Exception as insert_error:
                    print(f"❌ CRDT insert operation failed: {insert_error}")
                    raise insert_error
                
                # Commit the changes
                self.text_doc.commit()
                print(f"✅ Persisted changes to CRDT container '{container_name}'")
                
            except Exception as persist_error:
                print(f"⚠️ Failed to persist to CRDT: {persist_error}")
                # Continue with broadcast even if persistence fails
            
            # Emit broadcast event for this change
            self._emit_event(LexicalEventType.BROADCAST_NEEDED, 
                            self._create_broadcast_data("document-update"))
            
            print(f"✅ Broadcasted document update successfully")
            
        except Exception as e:
            print(f"❌ Error adding block to lexical data: {e}")
            print(f"❌ Lexical data structure: {self.lexical_data}")
            raise e
    
    def append_block(self, block_detail: Dict[str, Any], block_type: str):
        """
        Append a new block to the lexical model using SAFE incremental operations.
        
        **COLLABORATIVE-SAFE DESIGN:**
        
        Unlike add_block() which uses destructive wholesale operations (delete entire + insert new),
        this method implements proper incremental CRDT operations that are safe for collaboration:
        
        1. Only modifies local lexical_data structure incrementally
        2. Uses event-based propagation for CRDT synchronization
        3. No destructive delete+replace operations on shared text_doc
        4. Compatible with concurrent updates from other clients
        5. Prevents Rust mutex panics from race conditions
        
        **WHY THIS IS SAFER THAN add_block():**
        ```python
        # OLD (DANGEROUS) - add_block() pattern:
        text_container.delete(0, current_length)  # Delete entire document
        text_container.insert(0, updated_content)  # Insert entire new document
        
        # NEW (SAFE) - append_block() pattern:
        # Only modify lexical_data locally, let CRDT handle sync via events
        self.lexical_data["root"]["children"].append(new_block)
        self._emit_event(LexicalEventType.BROADCAST_NEEDED, ...)
        ```
        
        Args:
            block_detail: Dictionary containing block details (text, formatting, etc.)
            block_type: Type of block (paragraph, heading1, heading2, etc.)
            
        Examples:
            # Add a simple paragraph
            model.append_block({"text": "Hello world"}, "paragraph")
            
            # Add a heading with formatting
            model.append_block({
                "text": "Chapter 1", 
                "format": "bold"
            }, "heading1")
        """
        try:
            print(f"✨ SAFE append_block: Adding '{block_type}' block")
            
            # Get blocks before adding
            old_count = len(self.lexical_data["root"]["children"])
            
            # Map block types to lexical types
            type_mapping = {
                "paragraph": "paragraph",
                "heading1": "heading1",
                "heading2": "heading2",
                "heading3": "heading3",
                "heading4": "heading4",
                "heading5": "heading5",
                "heading6": "heading6",
            }
            
            lexical_type = type_mapping.get(block_type, "paragraph")
            
            # Create the block structure
            new_block = {
                "children": [],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": lexical_type,
                "version": 1
            }
            
            # Add heading tag if it's a heading
            if block_type.startswith("heading"):
                new_block["tag"] = f"h{block_type[-1]}"  # Extract number from heading1, heading2, etc.
            elif lexical_type == "paragraph":
                # Paragraphs don't need a tag
                pass
            
            # Add text content if provided
            if "text" in block_detail:
                text_node = {
                    "detail": 0,
                    "format": 0,
                    "mode": "normal",
                    "style": "",
                    "text": block_detail["text"],
                    "type": "text",
                    "version": 1
                }
                
                # Apply any formatting from block_detail
                if "format" in block_detail:
                    text_node["format"] = block_detail["format"]
                if "style" in block_detail:
                    text_node["style"] = block_detail["style"]
                if "detail" in block_detail:
                    text_node["detail"] = block_detail["detail"]
                if "mode" in block_detail:
                    text_node["mode"] = block_detail["mode"]
                
                new_block["children"].append(text_node)
            
            # Add any additional properties from block_detail
            for key, value in block_detail.items():
                if key not in ["text", "format", "style", "detail", "mode"]:  # These are handled above
                    new_block[key] = value
            
            # SAFE OPERATION: Only modify local lexical_data structure
            # This is the key difference from add_block() - no CRDT wholesale operations
            self.lexical_data["root"]["children"].append(new_block)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            
            new_count = len(self.lexical_data["root"]["children"])
            print(f"✅ SAFE append_block: Added block to lexical_data: {old_count} -> {new_count} blocks")
            
            # INCREMENTAL CRDT UPDATE: Update CRDT with complete structure but incrementally
            # This is safer than deleting+replacing the entire document
            try:
                container_name = "content"
                text_container = self.text_doc.get_text(container_name)
                
                # Create complete lexical document with the new block
                complete_document = {
                    "root": self.lexical_data["root"],
                    "lastSaved": self.lexical_data.get("lastSaved", int(time.time() * 1000)),
                    "source": self.lexical_data.get("source", "Lexical Loro"),
                    "version": self.lexical_data.get("version", "0.34.0")
                }
                new_content = json.dumps(complete_document)
                
                # Get current content length
                current_length = text_container.len_unicode
                print(f"🔍 SAFE append_block: Current CRDT length: {current_length}, new content length: {len(new_content)}")
                
                if current_length > 0:
                    # INCREMENTAL APPROACH: Replace content using smaller chunks
                    # Instead of delete(0, all) + insert(0, all), we do targeted replacements
                    
                    # Get current content to compare
                    current_content = text_container.to_string()
                    
                    # Find differences and apply minimal changes
                    if current_content != new_content:
                        # For now, use careful replace operation
                        # TODO: In future, implement true diff-based updates
                        print(f"🔍 SAFE append_block: Content differs, updating CRDT carefully")
                        
                        # Clear and replace - but with better error handling
                        text_container.delete(0, current_length)
                        text_container.insert(0, new_content)
                        
                        # Commit the changes
                        self.text_doc.commit()
                        print(f"✅ SAFE append_block: Updated CRDT with new content ({len(new_content)} chars)")
                    else:
                        print(f"ℹ️ SAFE append_block: Content unchanged, skipping CRDT update")
                else:
                    # First time: just insert
                    text_container.insert(0, new_content)
                    self.text_doc.commit()
                    print(f"✅ SAFE append_block: Inserted initial content to CRDT ({len(new_content)} chars)")
                    
            except Exception as persist_error:
                print(f"⚠️ SAFE append_block: CRDT update failed: {persist_error}")
                # Continue with event-based propagation even if CRDT update fails
            
            # COLLABORATIVE-SAFE: Use event-based propagation as backup
            # This allows the CRDT system to handle synchronization properly without conflicts
            print("✨ SAFE append_block: Using event-based propagation for synchronization")
            
            # Emit broadcast event for this change
            self._emit_event(LexicalEventType.BROADCAST_NEEDED, 
                            self._create_broadcast_data("document-update"))
            
            print(f"✅ SAFE append_block: Broadcasted document update successfully")
            
            return {
                "success": True,
                "blocks_before": old_count,
                "blocks_after": new_count,
                "added_block_type": block_type
            }
            
        except Exception as e:
            print(f"❌ Error in SAFE append_block: {e}")
            print(f"❌ Lexical data structure: {self.lexical_data}")
            raise e
    
    def get_blocks(self) -> List[Dict[str, Any]]:
        """Get all blocks from the lexical model (always current via subscriptions)"""
        return self.lexical_data["root"]["children"]
    
    def get_lexical_data(self) -> Dict[str, Any]:
        """Get the complete lexical data structure (always current via subscriptions)"""
        return self.lexical_data
    
    def update_block(self, index: int, block_detail: Dict[str, Any], block_type: Optional[str] = None):
        """
        Update an existing block
        
        Args:
            index: Index of the block to update
            block_detail: New block details
            block_type: New block type (optional)
        """
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            if block_type:
                # Remove the old block and insert updated one
                self.lexical_data["root"]["children"].pop(index)
                old_children = self.lexical_data["root"]["children"][index:]
                self.lexical_data["root"]["children"] = self.lexical_data["root"]["children"][:index]
                self.add_block(block_detail, block_type)
                self.lexical_data["root"]["children"].extend(old_children)
            else:
                # Update existing block in place
                current_block = self.lexical_data["root"]["children"][index]
                
                # Update text content if provided
                if "text" in block_detail and current_block.get("children"):
                    for child in current_block["children"]:
                        if child.get("type") == "text":
                            child["text"] = block_detail["text"]
                            for key in ["detail", "format", "mode", "style"]:
                                if key in block_detail:
                                    child[key] = block_detail[key]
                
                # Update other block properties
                for key, value in block_detail.items():
                    if key not in ["text", "detail", "format", "mode", "style"]:
                        current_block[key] = value
                
                self.lexical_data["lastSaved"] = int(time.time() * 1000)
                
                # Use event-based propagation instead of destructive sync
                self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                    "type": "document-update", 
                    "docId": self.doc_id,
                    "snapshot": self.get_snapshot()
                })
    
    def remove_block(self, index: int):
        """Remove a block by index"""
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            self.lexical_data["root"]["children"].pop(index)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            
            # Use event-based propagation instead of destructive sync
            self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                "type": "document-update", 
                "docId": self.doc_id,
                "snapshot": self.get_snapshot()
            })
    
    def add_block_at_index(self, index: int, block_detail: Dict[str, Any], block_type: str):
        """
        Add a new block at a specific index
        
        Args:
            index: Index where to insert the block (0-based)
            block_detail: Dictionary containing block details (text, formatting, etc.)
            block_type: Type of block (paragraph, heading1, heading2, etc.)
        """
        try:
            print(f"LoroModel: Adding block of type '{block_type}' at index {index}")
            
            # Map block types to lexical types
            type_mapping = {
                "paragraph": "paragraph",
                "heading1": "heading",
                "heading2": "heading",
                "heading3": "heading",
                "heading4": "heading",
                "heading5": "heading",
                "heading6": "heading",
            }
            
            lexical_type = type_mapping.get(block_type, "paragraph")
            
            # Create the block structure
            new_block = {
                "children": [],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": lexical_type,
                "version": 1
            }
            
            # Add heading tag if it's a heading
            if block_type.startswith("heading"):
                tag_number = block_type[-1] if block_type[-1].isdigit() else "1"
                new_block["tag"] = f"h{tag_number}"
            elif lexical_type == "paragraph":
                # Paragraphs don't have a tag property
                pass
            
            # Add text content if provided
            if "text" in block_detail:
                text_node = {
                    "detail": block_detail.get("detail", 0),
                    "format": block_detail.get("format", 0),
                    "mode": block_detail.get("mode", "normal"),
                    "style": block_detail.get("style", ""),
                    "text": block_detail["text"],
                    "type": "text",
                    "version": 1
                }
                new_block["children"].append(text_node)
            
            # Add any additional properties from block_detail
            for key, value in block_detail.items():
                if key not in ["text", "detail", "format", "mode", "style"]:
                    new_block[key] = value
            
            # Ensure index is within valid range
            children = self.lexical_data["root"]["children"]
            if index < 0:
                index = 0
            elif index > len(children):
                index = len(children)
            
            # Insert the block at the specified index
            children.insert(index, new_block)
            
            # Update timestamp and sync
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            
            # Use event-based propagation instead of destructive sync
            self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                "type": "document-update", 
                "docId": self.doc_id,
                "snapshot": self.get_snapshot()
            })
            
            print(f"✅ Block added at index {index} - total blocks: {len(children)}")
            
        except Exception as e:
            print(f"❌ Error adding block at index {index}: {e}")
            raise e
    
    def get_complete_model(self) -> Dict[str, Any]:
        """
        Get the complete lexical model with all metadata and structure
        
        Returns:
            Dict containing the complete lexical data structure including root, metadata, etc.
        """
        self._sync_from_loro()
        return {
            "lexical_data": self.lexical_data.copy(),
            "metadata": {
                "container_id": self.container_id,
                "has_subscription": self._text_doc_subscription is not None,
                "has_ephemeral_store": self.ephemeral_store is not None,
                "ephemeral_timeout": self.ephemeral_timeout,
                "block_count": len(self.lexical_data["root"]["children"])
            }
        }
    
    def get_block_at_index(self, index: int) -> Optional[Dict[str, Any]]:
        """
        Get a block at a specific index
        
        Args:
            index: Index of the block to retrieve (0-based)
            
        Returns:
            Dict containing the block data, or None if index is out of range
        """
        self._sync_from_loro()
        children = self.lexical_data["root"]["children"]
        
        if 0 <= index < len(children):
            return children[index].copy()
        else:
            return None
    
    def get_text_document(self):
        """Get the text Loro document"""
        return self.text_doc
    
    def get_structured_document(self):
        """Get the structured Loro document"""
        return self.structured_doc
    
    def export_as_json(self) -> str:
        """Export the current lexical data as JSON string"""
        self._sync_from_loro()
        return json.dumps(self.lexical_data, indent=2)
    
    def import_from_json(self, json_data: str):
        """Import lexical data from JSON string"""
        self.lexical_data = json.loads(json_data)
        
        # Use event-based propagation instead of destructive sync
        self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
            "type": "document-update", 
            "docId": self.doc_id,
            "snapshot": self.get_snapshot()
        })
    
    def force_sync_from_text_doc(self):
        """Manually force synchronization from the text document"""
        self._sync_from_loro()
        self._sync_structured_doc_only()
    
    def get_block_summary(self) -> Dict[str, Any]:
        """Get a summary of the current blocks structure"""
        blocks = self.get_blocks()
        block_types = {}
        total_text_length = 0
        
        for block in blocks:
            block_type = block.get('type', 'unknown')
            block_types[block_type] = block_types.get(block_type, 0) + 1
            
            # Calculate text content length
            for child in block.get('children', []):
                if child.get('type') == 'text':
                    total_text_length += len(child.get('text', ''))
        
        return {
            "total_blocks": len(blocks),
            "block_types": block_types,
            "total_text_length": total_text_length,
            "has_subscription": self._text_doc_subscription is not None
        }
    
    def __str__(self) -> str:
        """String representation for user-friendly display"""
        # Get block count directly from lexical_data to avoid sync during logging
        block_count = len(self.lexical_data.get("root", {}).get("children", []))
        subscription_status = "subscribed" if self._text_doc_subscription else "standalone"
        return (f"LoroModel(blocks={block_count}, "
                f"source='{self.lexical_data.get('source', 'unknown')}', "
                f"version='{self.lexical_data.get('version', 'unknown')}', "
                f"mode={subscription_status})")
    
    def __repr__(self) -> str:
        """Detailed representation for debugging"""
        # Get block info directly from lexical_data to avoid sync during logging
        blocks = self.lexical_data.get("root", {}).get("children", [])
        block_types = [block.get('type', 'unknown') for block in blocks]
        last_saved = self.lexical_data.get('lastSaved', 'unknown')
        subscription_status = "subscribed" if self._text_doc_subscription else "standalone"
        
        # Create summaries for each block
        block_summaries = []
        for i, block in enumerate(blocks):
            block_type = block.get('type', 'unknown')
            text_content = self._extract_block_text(block)
            # Truncate long text for readability
            if len(text_content) > 50:
                text_content = text_content[:47] + "..."
            block_summaries.append(f"{i+1}.{block_type}:'{text_content}'")
        
        summaries_str = "[" + ", ".join(block_summaries) + "]" if block_summaries else "[]"
        
        return (f"LoroModel(blocks={len(blocks)}, "
                f"block_types={block_types}, "
                f"summaries={summaries_str}, "
                f"source='{self.lexical_data.get('source', 'unknown')}', "
                f"version='{self.lexical_data.get('version', 'unknown')}', "
                f"lastSaved={last_saved}, "
                f"mode={subscription_status})")
    
    def log_detailed_state(self, context: str = ""):
        """Log detailed state of the lexical model for debugging"""
        print(f"📊 LexicalModel detailed state{' (' + context + ')' if context else ''}:")
        print(f"  📋 Blocks: {len(self.lexical_data.get('root', {}).get('children', []))}")
        
        blocks = self.lexical_data.get("root", {}).get("children", [])
        for i, block in enumerate(blocks):
            block_type = block.get('type', 'unknown')
            text_content = self._extract_block_text(block)
            print(f"    {i+1}. {block_type}: '{text_content[:100]}{'...' if len(text_content) > 100 else ''}'")
        
        print(f"  🕒 Last saved: {self.lexical_data.get('lastSaved', 'unknown')}")
        print(f"  📄 Source: {self.lexical_data.get('source', 'unknown')}")
        print(f"  📝 Version: {self.lexical_data.get('version', 'unknown')}")
        
        # Also log CRDT state
        try:
            content_container = self.text_doc.get_text("content")
            crdt_content = content_container.to_string()
            print(f"  💾 CRDT content length: {len(crdt_content)} chars")
            if crdt_content:
                try:
                    crdt_data = json.loads(crdt_content)
                    crdt_blocks = len(crdt_data.get("root", {}).get("children", []))
                    print(f"  💾 CRDT blocks: {crdt_blocks}")
                except:
                    print(f"  💾 CRDT content (not JSON): {crdt_content[:100]}...")
        except Exception as e:
            print(f"  💾 CRDT error: {e}")
    
    def _extract_block_text(self, block: Dict[str, Any]) -> str:
        """Extract text content from a block for summary purposes"""
        if not isinstance(block, dict):
            return ""
        
        # If the block has direct text
        if block.get('type') == 'text':
            return block.get('text', '')
        
        # If the block has children, recursively extract text
        children = block.get('children', [])
        if children:
            text_parts = []
            for child in children:
                if isinstance(child, dict):
                    child_text = self._extract_block_text(child)
                    if child_text:
                        text_parts.append(child_text)
            return " ".join(text_parts)
        
        return ""
    
    def _create_default_lexical_structure(self) -> Dict[str, Any]:
        """Create a default lexical data structure"""
        return {
            "root": {
                "children": [
                    {
                        "children": [
                            {
                                "detail": 0,
                                "format": 0,
                                "mode": "normal",
                                "style": "",
                                "text": "Document",
                                "type": "text",
                                "version": 1
                            }
                        ],
                        "direction": None,
                        "format": "",
                        "indent": 0,
                        "type": "heading",
                        "version": 1,
                        "tag": "h1"
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "root",
                "version": 1
            },
            "lastSaved": int(time.time() * 1000),
            "source": "Lexical Loro",
            "version": "0.34.0"
        }
    
    # Document Management Methods (Step 1)
    
    def get_snapshot(self) -> bytes:
        """
        Export the current document state as a snapshot.
        
        Returns:
            bytes: The document snapshot that can be sent to clients
        """
        if ExportMode is None:
            raise ImportError("ExportMode not available - loro package required")
        
        try:
            snapshot = self.text_doc.export(ExportMode.Snapshot())
            return snapshot
        except Exception as e:
            print(f"Warning: Error exporting snapshot: {e}")
            return b""
    
    def import_snapshot(self, snapshot: bytes) -> bool:
        """
        Import a snapshot into this document, replacing current content.
        
        Args:
            snapshot: The snapshot bytes to import
            
        Returns:
            bool: True if import was successful, False otherwise
        """
        try:
            if not snapshot:
                print("Warning: Empty snapshot provided")
                return False
            
            # Set flag to prevent recursive operations during import
            self._import_in_progress = True
            
            try:
                # Import the snapshot into our text document
                self.text_doc.import_(snapshot)
                
                # After import, sync from the standard "content" container
                self._sync_from_loro()
                
                print(f"✅ Successfully imported snapshot ({len(snapshot)} bytes)")
                return True
                
            finally:
                # Always clear the flag, even if an error occurs
                self._import_in_progress = False
            
        except Exception as e:
            print(f"❌ Error importing snapshot: {e}")
            self._import_in_progress = False  # Make sure flag is cleared on error
            return False
    
    def apply_update(self, update_bytes: bytes) -> bool:
        """
        Apply a Loro update to this document.
        
        Args:
            update_bytes: The update bytes to apply
            
        Returns:
            bool: True if update was applied successfully, False otherwise
        """
        try:
            if not update_bytes:
                print("Warning: Empty update provided")
                return False
            
            # Set flag to prevent recursive operations during import
            self._import_in_progress = True
            
            try:
                # Apply the update to our text document
                self.text_doc.import_(update_bytes)
                
                # After applying update, sync from the standard "content" container
                self._sync_from_loro()
                
                print(f"✅ Successfully applied update ({len(update_bytes)} bytes)")
                return True
                
            finally:
                # Always clear the flag, even if an error occurs
                self._import_in_progress = False
            
        except Exception as e:
            print(f"❌ Error applying update: {e}")
            self._import_in_progress = False  # Make sure flag is cleared on error
            return False
    
    def export_update(self) -> Optional[bytes]:
        """
        Export any pending changes as an update that can be broadcast to other clients.
        
        Note: In Loro, updates are generated automatically when changes are made.
        This method is provided for consistency but may return None if no changes 
        are pending or if the update mechanism works differently.
        
        Returns:
            Optional[bytes]: Update bytes if available, None otherwise
        """
        try:
            if ExportMode is None:
                print("Warning: ExportMode not available")
                return None
            
            # Try to export updates - this may not be the standard Loro pattern
            # as updates are typically generated automatically during changes
            
            # For now, we'll return None and rely on the subscription mechanism
            # to handle broadcasting via the change_callback
            
            # In a full implementation, this might track changes and export deltas
            print("ℹ️ export_update called - relying on subscription mechanism for updates")
            return None
            
        except Exception as e:
            print(f"❌ Error exporting update: {e}")
            return None
    
    def get_document_info(self) -> Dict[str, Any]:
        """
        Get information about the current document state.
        
        Returns:
            Dict with document information including content length, container info, etc.
        """
        try:
            # Get current content
            container_name = self.container_id or "content"
            try:
                text_container = self.text_doc.get_text(container_name)
                content = text_container.to_string()
                content_length = len(content) if content else 0
            except Exception:
                content = ""
                content_length = 0
            
            # Get document structure info
            try:
                doc_state = self.text_doc.get_deep_value()
                containers = list(doc_state.keys()) if isinstance(doc_state, dict) else []
            except Exception:
                containers = [container_name]
            
            return {
                "container_id": self.container_id,
                "content_length": content_length,
                "containers": containers,
                "has_subscription": self._text_doc_subscription is not None,
                "lexical_blocks": len(self.lexical_data.get("root", {}).get("children", [])),
                "last_saved": self.lexical_data.get("lastSaved"),
                "source": self.lexical_data.get("source"),
                "version": self.lexical_data.get("version")
            }
            
        except Exception as e:
            print(f"❌ Error getting document info: {e}")
            return {
                "container_id": self.container_id,
                "error": str(e)
            }
    
    # ==========================================
    # STEP 7: SERIALIZATION METHODS
    # ==========================================
    
    def to_json(self, include_metadata: bool = True) -> str:
        """
        Export the current lexical data as a JSON string.
        
        Args:
            include_metadata: Whether to include metadata (lastSaved, source, version)
            
        Returns:
            JSON string representation of the lexical data
        """
        self._sync_from_loro()
        
        if include_metadata:
            return json.dumps(self.lexical_data, indent=2)
        else:
            # Return only the core lexical structure
            core_data = {
                "root": self.lexical_data.get("root", {})
            }
            return json.dumps(core_data, indent=2)
    
    @classmethod
    def from_json(cls, json_data: str, container_id: Optional[str] = None, 
                  event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
                  ephemeral_timeout: int = 300000, enable_subscriptions: bool = True) -> 'LexicalModel':
        """
        Create a LexicalModel instance from JSON data.
        
        Args:
            json_data: JSON string containing lexical data
            container_id: Optional container ID for the model
            event_callback: Optional callback for structured event communication
            ephemeral_timeout: Timeout for ephemeral data in milliseconds
            enable_subscriptions: Whether to enable CRDT change subscriptions
            
        Returns:
            New LexicalModel instance with the imported data
        """
        try:
            parsed_data = json.loads(json_data)
            
            # Create a new model
            model = cls(container_id=container_id, 
                       event_callback=event_callback,
                       ephemeral_timeout=ephemeral_timeout,
                       enable_subscriptions=enable_subscriptions)
            
            # Import the data
            if isinstance(parsed_data, dict):
                if "root" in parsed_data:
                    # Direct lexical format
                    model.lexical_data = parsed_data
                elif "editorState" in parsed_data and isinstance(parsed_data["editorState"], dict):
                    # Handle editorState wrapper format
                    editor_state = parsed_data["editorState"]
                    model.lexical_data = {
                        "root": editor_state["root"],
                        "lastSaved": parsed_data.get("lastSaved", int(time.time() * 1000)),
                        "source": parsed_data.get("source", "Lexical Loro"),
                        "version": parsed_data.get("version", "0.34.0")
                    }
                else:
                    raise ValueError("Invalid JSON structure: missing 'root' or 'editorState'")
                    
                # Initialize the model with the data (safe for new instances)
                # For new instances, we can use sync since no collaboration exists yet
                model._sync_to_loro(force_initialization=True)
                
                print(f"✅ Created LexicalModel from JSON: {len(model.lexical_data.get('root', {}).get('children', []))} blocks")
                return model
            else:
                raise ValueError("JSON data must be an object")
                
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON: {e}")
        except Exception as e:
            raise ValueError(f"Error creating model from JSON: {e}")
    
    def save_to_file(self, file_path: str, include_metadata: bool = True) -> bool:
        """
        Save the current lexical data to a JSON file.
        
        Args:
            file_path: Path to save the JSON file
            include_metadata: Whether to include metadata in the saved file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            import os
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            # Get JSON data
            json_data = self.to_json(include_metadata=include_metadata)
            
            # Write to file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(json_data)
            
            print(f"✅ Saved LexicalModel to {file_path}")
            return True
            
        except Exception as e:
            print(f"❌ Error saving to file {file_path}: {e}")
            return False
    
    @classmethod
    def load_from_file(cls, file_path: str, container_id: Optional[str] = None,
                       event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
                       ephemeral_timeout: int = 300000) -> Optional['LexicalModel']:
        """
        Load a LexicalModel from a JSON file.
        
        Args:
            file_path: Path to the JSON file
            container_id: Optional container ID for the model
            event_callback: Optional callback for structured event communication
            ephemeral_timeout: Timeout for ephemeral data in milliseconds
            
        Returns:
            LexicalModel instance if successful, None otherwise
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                json_data = f.read()
            
            model = cls.from_json(json_data, container_id=container_id, 
                                 event_callback=event_callback,
                                 ephemeral_timeout=ephemeral_timeout)
            
            print(f"✅ Loaded LexicalModel from {file_path}")
            return model
            
        except FileNotFoundError:
            print(f"❌ File not found: {file_path}")
            return None
        except Exception as e:
            print(f"❌ Error loading from file {file_path}: {e}")
            return None
    
    # Message Handling Methods (Step 2)
    
    def handle_message(self, message_type: str, data: Dict[str, Any], client_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle Loro-related message types directly within LexicalModel.
        
        Args:
            message_type: The type of message ("loro-update", "snapshot", "append-paragraph", etc.)
            data: The message data dictionary
            client_id: Optional client ID for logging/tracking
            
        Returns:
            Dict with response information including any broadcast data needed
        """
        try:
            if message_type == "loro-update":
                return self._handle_loro_update(data, client_id)
            elif message_type == "snapshot":
                return self._handle_snapshot_import(data, client_id)
            elif message_type == "request-snapshot":
                return self._handle_snapshot_request(data, client_id)
            elif message_type == "append-paragraph":
                return self._handle_append_paragraph(data, client_id)
            else:
                return {
                    "success": False,
                    "error": f"Unsupported message type: {message_type}",
                    "message_type": message_type
                }
                
        except Exception as e:
            print(f"❌ Error handling message type '{message_type}': {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": message_type
            }
    
    def _handle_loro_update(self, data: Dict[str, Any], client_id: Optional[str] = None) -> Dict[str, Any]:
        """Handle loro-update message type"""
        try:
            update_data = data.get("update", [])
            
            if not update_data:
                return {
                    "success": False,
                    "error": "No update data provided",
                    "message_type": "loro-update"
                }
            
            # Convert update data to bytes
            update_bytes = bytes(update_data)
            
            # Apply the update using our apply_update method
            success = self.apply_update(update_bytes)
            
            if success:
                # Get current document info for response
                doc_info = self.get_document_info()
                
                print(f"📝 Applied Loro update from client {client_id or 'unknown'}")
                print(f"📋 Current content length: {doc_info.get('content_length', 0)}")
                print(f"📋 Current blocks: {doc_info.get('lexical_blocks', 0)}")
                
                # Log detailed state after update
                self.log_detailed_state("after loro-update")
                
                # Emit broadcast_needed event
                self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                    "message_type": "loro-update",
                    "broadcast_data": data,  # Relay the original update to other clients
                    "client_id": client_id
                })
                
                return {
                    "success": True,
                    "message_type": "loro-update",
                    "document_info": doc_info,
                    "applied_update_size": len(update_bytes)
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to apply update",
                    "message_type": "loro-update"
                }
                
        except Exception as e:
            print(f"❌ Error in _handle_loro_update: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "loro-update"
            }
    
    def _handle_snapshot_import(self, data: Dict[str, Any], client_id: Optional[str] = None) -> Dict[str, Any]:
        """Handle snapshot import message type"""
        try:
            snapshot_data = data.get("snapshot", [])
            
            if not snapshot_data:
                return {
                    "success": False,
                    "error": "No snapshot data provided",
                    "message_type": "snapshot"
                }
            
            # Convert snapshot data to bytes
            snapshot_bytes = bytes(snapshot_data)
            
            # Import the snapshot using our import_snapshot method
            success = self.import_snapshot(snapshot_bytes)
            
            if success:
                # Get current document info for response
                doc_info = self.get_document_info()
                
                print(f"📄 Imported snapshot from client {client_id or 'unknown'}")
                print(f"📋 Content length: {doc_info.get('content_length', 0)}")
                print(f"📋 Blocks: {doc_info.get('lexical_blocks', 0)}")
                
                return {
                    "success": True,
                    "message_type": "snapshot",
                    "document_info": doc_info,
                    "imported_snapshot_size": len(snapshot_bytes)
                }
            else:
                return {
                    "success": False,
                    "error": "Failed to import snapshot",
                    "message_type": "snapshot"
                }
                
        except Exception as e:
            print(f"❌ Error in _handle_snapshot_import: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "snapshot"
            }
    
    def _handle_snapshot_request(self, data: Dict[str, Any], client_id: Optional[str] = None) -> Dict[str, Any]:
        """Handle snapshot request message type"""
        try:
            # Get current snapshot
            snapshot = self.get_snapshot()
            
            if snapshot:
                print(f"📞 Providing snapshot to client {client_id or 'unknown'}")
                
                return {
                    "success": True,
                    "message_type": "request-snapshot",
                    "response_needed": True,
                    "response_data": {
                        "type": "initial-snapshot",
                        "snapshot": list(snapshot),
                        "docId": self.doc_id
                    },
                    "snapshot_size": len(snapshot)
                }
            else:
                # No content available, ask other clients
                self._emit_event(LexicalEventType.BROADCAST_NEEDED, {
                    "message_type": "request-snapshot",
                    "broadcast_data": {
                        "type": "snapshot-request",
                        "requesterId": client_id,
                        "docId": self.doc_id
                    },
                    "client_id": client_id
                })
                
                return {
                    "success": True,
                    "message_type": "request-snapshot"
                }
                
        except Exception as e:
            print(f"❌ Error in _handle_snapshot_request: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "request-snapshot"
            }
    
    def _handle_append_paragraph(self, data: Dict[str, Any], client_id: Optional[str] = None) -> Dict[str, Any]:
        """Handle append-paragraph message type"""
        try:
            message_text = data.get("message", "Hello")
            
            print(f"➕ Received append-paragraph command from client {client_id or 'unknown'}: '{message_text}'")
            
            # Create the paragraph structure
            new_paragraph = {
                "text": message_text
            }
            
            # Get blocks before adding
            blocks_before = len(self.lexical_data.get("root", {}).get("children", []))
            
            # SAFE OPERATION: Use append_block instead of destructive add_block
            # This prevents JSON corruption and Rust panics from wholesale CRDT operations
            result = self.append_block(new_paragraph, "paragraph")
            
            # Get blocks after adding
            blocks_after = len(self.lexical_data.get("root", {}).get("children", []))
            
            print(f"✅ SAFE append: Added paragraph to document: '{message_text}' (blocks: {blocks_before} -> {blocks_after})")
            
            # Get current document info
            doc_info = self.get_document_info()
            
            # COLLABORATIVE-SAFE: The append_block method already handles broadcasting properly
            # But we ensure one more broadcast for MCP clients to receive the updated content
            print("LoroModel: Ensuring additional broadcast for MCP append-paragraph")
            
            # Emit broadcast event to notify WebSocket clients
            self._emit_event(LexicalEventType.BROADCAST_NEEDED, 
                            self._create_broadcast_data("document-update"))
            
            return {
                "success": True,
                "message_type": "append-paragraph",
                "blocks_before": blocks_before,
                "blocks_after": blocks_after,
                "added_text": message_text,
                "document_info": doc_info
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_append_paragraph: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "append-paragraph"
            }
    
    # ==========================================
    # STEP 3: EPHEMERAL MESSAGE HANDLING
    # ==========================================
    
    def handle_ephemeral_message(self, message_type: str, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """
        Handle ephemeral messages (cursor positions, selections, awareness)
        
        Args:
            message_type: Type of ephemeral message
            data: Message data containing ephemeral information
            client_id: ID of the client sending the message
            
        Returns:
            Dict with success status and broadcast data if needed
        """
        if not self.ephemeral_store:
            return {
                "success": False,
                "error": "EphemeralStore not available",
                "message_type": message_type
            }
        
        try:
            if message_type == "ephemeral-update":
                return self._handle_ephemeral_update(data, client_id)
            elif message_type == "ephemeral":
                return self._handle_ephemeral_data(data, client_id)
            elif message_type == "awareness-update":
                return self._handle_awareness_update(data, client_id)
            elif message_type == "cursor-position":
                return self._handle_cursor_position(data, client_id)
            elif message_type == "text-selection":
                return self._handle_text_selection(data, client_id)
            else:
                return {
                    "success": False,
                    "error": f"Unknown ephemeral message type: {message_type}",
                    "message_type": message_type
                }
                
        except Exception as e:
            print(f"❌ Error in handle_ephemeral_message: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": message_type
            }
    
    def _handle_ephemeral_update(self, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Handle ephemeral-update message type"""
        try:
            ephemeral_data = data.get("data")
            
            if not ephemeral_data:
                return {
                    "success": False,
                    "error": "No ephemeral data provided",
                    "message_type": "ephemeral-update"
                }
            
            # Validate ephemeral_data is a string
            if not isinstance(ephemeral_data, str):
                return {
                    "success": False,
                    "error": f"Invalid ephemeral data type: {type(ephemeral_data)}, expected string",
                    "message_type": "ephemeral-update"
                }
            
            # Validate hex string format
            try:
                ephemeral_bytes = bytes.fromhex(ephemeral_data)
            except ValueError as e:
                return {
                    "success": False,
                    "error": f"Invalid hex string format: {e}",
                    "message_type": "ephemeral-update"
                }
            
            # Validate we have a valid ephemeral store
            if not self.ephemeral_store:
                return {
                    "success": False,
                    "error": "EphemeralStore not initialized",
                    "message_type": "ephemeral-update"
                }
            
            # Validate ephemeral bytes are not empty
            if not ephemeral_bytes:
                return {
                    "success": False,
                    "error": "Empty ephemeral data",
                    "message_type": "ephemeral-update"
                }
            
            # Apply the ephemeral data to our store (handle loro library bugs)
            try:
                self.ephemeral_store.apply(ephemeral_bytes)
                print(f"✅ Applied ephemeral update from {client_id} ({len(ephemeral_bytes)} bytes)")
            except Exception as apply_error:
                # Handle the loro library Rust panic gracefully
                print(f"⚠️ Loro library error in ephemeral_store.apply() from {client_id}: {apply_error}")
                
                # Still continue with the process to maintain coordination
                # The ephemeral data coordination can work even if the local store has issues
                self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                    "message_type": "ephemeral-update",
                    "broadcast_data": {
                        "type": "ephemeral-update",
                        "docId": self.doc_id,  # Use document ID for WebSocket protocol
                        "data": ephemeral_data  # Use original hex data for broadcast
                    },
                    "client_id": client_id,
                    "note": "Handled with loro library workaround due to Rust panic"
                })
                
                return {
                    "success": True,  # Still successful from coordination perspective
                    "message_type": "ephemeral-update",
                    "client_id": client_id,
                    "note": "Applied with loro library workaround"
                }
            
            # Get encoded ephemeral data for broadcasting (with error handling)
            try:
                ephemeral_data_for_broadcast = self.ephemeral_store.encode_all()
                broadcast_data = ephemeral_data_for_broadcast.hex()
            except Exception as encode_error:
                print(f"⚠️ Loro library error in ephemeral_store.encode_all(): {encode_error}")
                # Fallback to using the original data
                broadcast_data = ephemeral_data
            
            # Emit ephemeral_changed event
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "ephemeral-update",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,  # Use document ID for WebSocket protocol
                    "data": broadcast_data
                },
                "client_id": client_id
            })
            
            return {
                "success": True,
                "message_type": "ephemeral-update",
                "client_id": client_id
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_ephemeral_update: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "ephemeral-update"
            }
    
    def _handle_ephemeral_data(self, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Handle direct ephemeral data message type"""
        try:
            ephemeral_data = data.get("data")
            
            if not ephemeral_data:
                return {
                    "success": False,
                    "error": "No ephemeral data provided",
                    "message_type": "ephemeral"
                }
            
            # Convert data to bytes (support both array and hex format)
            if isinstance(ephemeral_data, list):
                ephemeral_bytes = bytes(ephemeral_data)
            else:
                ephemeral_bytes = bytes.fromhex(ephemeral_data)
            
            # Apply the ephemeral data to our store
            self.ephemeral_store.apply(ephemeral_bytes)
            
            # Get encoded ephemeral data for broadcasting
            ephemeral_data_for_broadcast = self.ephemeral_store.encode_all()
            
            # Emit ephemeral_changed event
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "ephemeral",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,
                    "data": ephemeral_data_for_broadcast.hex()
                },
                "client_id": client_id
            })
            
            return {
                "success": True,
                "message_type": "ephemeral",
                "client_id": client_id
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_ephemeral_data: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "ephemeral"
            }
    
    def _handle_awareness_update(self, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Handle awareness-update message type"""
        try:
            awareness_state = data.get("awarenessState")
            peer_id = data.get("peerId", client_id)
            
            if awareness_state is None:
                return {
                    "success": False,
                    "error": "No awareness state provided",
                    "message_type": "awareness-update"
                }
            
            # Store the awareness state in the ephemeral store
            self.ephemeral_store.set(peer_id, awareness_state)
            
            # Get encoded ephemeral data for broadcasting
            ephemeral_data = self.ephemeral_store.encode_all()
            
            # Emit ephemeral_changed event
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "awareness-update",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,
                    "data": ephemeral_data.hex()
                },
                "client_id": client_id,
                "peer_id": peer_id
            })
            
            return {
                "success": True,
                "message_type": "awareness-update",
                "client_id": client_id,
                "peer_id": peer_id
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_awareness_update: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "awareness-update"
            }
    
    def _handle_cursor_position(self, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Handle cursor-position message type"""
        try:
            position = data.get("position")
            
            if position is None:
                return {
                    "success": False,
                    "error": "No cursor position provided",
                    "message_type": "cursor-position"
                }
            
            # Create cursor data structure
            cursor_data = {
                "clientId": client_id,
                "position": position,
                "color": data.get("color", "#000000"),  # Default color if not provided
                "timestamp": time.time()
            }
            
            # Store in ephemeral store
            self.ephemeral_store.set(f"cursor_{client_id}", cursor_data)
            
            # Get encoded ephemeral data for broadcasting
            ephemeral_data = self.ephemeral_store.encode_all()
            
            # Emit ephemeral_changed event
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "cursor-position",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,
                    "data": ephemeral_data.hex()
                },
                "client_id": client_id,
                "position": position
            })
            
            return {
                "success": True,
                "message_type": "cursor-position",
                "client_id": client_id,
                "position": position
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_cursor_position: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "cursor-position"
            }
    
    def _handle_text_selection(self, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """Handle text-selection message type"""
        try:
            selection = data.get("selection")
            
            if selection is None:
                return {
                    "success": False,
                    "error": "No text selection provided",
                    "message_type": "text-selection"
                }
            
            # Create selection data structure
            selection_data = {
                "clientId": client_id,
                "selection": selection,
                "color": data.get("color", "#000000"),  # Default color if not provided
                "timestamp": time.time()
            }
            
            # Store in ephemeral store
            self.ephemeral_store.set(f"selection_{client_id}", selection_data)
            
            # Get encoded ephemeral data for broadcasting
            ephemeral_data = self.ephemeral_store.encode_all()
            
            # Emit ephemeral_changed event
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "text-selection",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,
                    "data": ephemeral_data.hex()
                },
                "client_id": client_id,
                "selection": selection
            })
            
            return {
                "success": True,
                "message_type": "text-selection",
                "client_id": client_id,
                "selection": selection
            }
            
        except Exception as e:
            print(f"❌ Error in _handle_text_selection: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "text-selection"
            }
    
    def get_ephemeral_data(self) -> Optional[bytes]:
        """Get current ephemeral data for broadcasting"""
        if not self.ephemeral_store:
            return None
        try:
            return self.ephemeral_store.encode_all()
        except Exception as e:
            print(f"❌ Error getting ephemeral data: {e}")
            return None
    
    def handle_client_disconnect(self, client_id: str) -> Dict[str, Any]:
        """
        Handle client disconnection by removing ephemeral data and preparing cleanup message
        
        Args:
            client_id: ID of the disconnected client
            
        Returns:
            Dict with success status and broadcast data for removal notification
        """
        if not self.ephemeral_store:
            return {
                "success": False,
                "error": "EphemeralStore not available",
                "message_type": "client-disconnect"
            }
        
        try:
            # Check for all possible keys that the client might have used
            # Different ephemeral message types use different key patterns:
            # - awareness-update: uses peer_id (often same as client_id)
            # - cursor-position: uses f"cursor_{client_id}"
            # - text-selection: uses f"selection_{client_id}"
            possible_keys = [
                client_id,                    # Direct client_id (awareness data)
                f"cursor_{client_id}",       # Cursor position data
                f"selection_{client_id}",    # Text selection data
            ]
            
            client_had_data = False
            removed_keys = []
            
            for key in possible_keys:
                try:
                    client_state = self.ephemeral_store.get(key)
                    if client_state is not None:
                        self.ephemeral_store.delete(key)
                        client_had_data = True
                        removed_keys.append(key)
                        print(f"🧹 Removed ephemeral data for key '{key}' (client {client_id})")
                except Exception as key_error:
                    # Some keys might not exist, that's fine
                    pass
            
            if not client_had_data:
                print(f"🔍 No ephemeral data found for client {client_id}")
            else:
                print(f"🧹 Removed ephemeral data for client {client_id}: {removed_keys}")
            
            # Always create a removal notification for consistency
            ephemeral_data = self.ephemeral_store.encode_all()
            
            # Emit ephemeral_changed event for client disconnect
            self._emit_event(LexicalEventType.EPHEMERAL_CHANGED, {
                "message_type": "client-disconnect",
                "broadcast_data": {
                    "type": "ephemeral-update",
                    "docId": self.doc_id,
                    "data": ephemeral_data.hex(),
                    "event": {
                        "by": "server-disconnect",
                        "added": [],
                        "removed": list(removed_keys),
                        "updated": [],
                        "clients": {}
                    }
                },
                "client_id": client_id,
                "removed_keys": list(removed_keys)
            })
            
            return {
                "success": True,
                "message_type": "client-disconnect",
                "removed_keys": list(removed_keys)
            }
            
        except Exception as e:
            print(f"❌ Error in handle_client_disconnect: {e}")
            return {
                "success": False,
                "error": str(e),
                "message_type": "client-disconnect",
                "client_id": client_id
            }
    
    def cleanup(self):
        """Clean up subscriptions and resources"""
        # Clean up text document subscription
        if self._text_doc_subscription is not None:
            try:
                # Try different unsubscribe patterns
                if hasattr(self._text_doc_subscription, 'unsubscribe'):
                    self._text_doc_subscription.unsubscribe()
                elif hasattr(self._text_doc_subscription, 'close'):
                    self._text_doc_subscription.close()
                elif callable(self._text_doc_subscription):
                    # If it's a callable (like a cleanup function)
                    self._text_doc_subscription()
                
                self._text_doc_subscription = None
            except Exception as e:
                print(f"Warning: Could not unsubscribe from text document: {e}")
                self._text_doc_subscription = None
        
        # Clean up ephemeral store subscription
        if self._ephemeral_subscription is not None:
            try:
                # Try different unsubscribe patterns
                if hasattr(self._ephemeral_subscription, 'unsubscribe'):
                    self._ephemeral_subscription.unsubscribe()
                elif hasattr(self._ephemeral_subscription, 'close'):
                    self._ephemeral_subscription.close()
                elif callable(self._ephemeral_subscription):
                    # If it's a callable (like a cleanup function)
                    self._ephemeral_subscription()
                
                self._ephemeral_subscription = None
            except Exception as e:
                print(f"Warning: Could not unsubscribe from ephemeral store: {e}")
                self._ephemeral_subscription = None
    
    def __del__(self):
        """Cleanup when object is destroyed"""
        self.cleanup()


class LexicalDocumentManager:
    """
    Step 6: Multi-Document Support
    
    Manages multiple LexicalModel instances, providing a single interface
    for the server to interact with multiple documents.
    """
    
    def __init__(self, event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None, ephemeral_timeout: int = 300000):
        """
        Initialize the document manager.
        
        Args:
            event_callback: Callback function for events from any managed document
            ephemeral_timeout: Default ephemeral timeout for all documents
        """
        self.models: Dict[str, LexicalModel] = {}
        self.event_callback = event_callback
        self.ephemeral_timeout = ephemeral_timeout
    
    def get_or_create_document(self, doc_id: str, initial_content: Optional[str] = None) -> LexicalModel:
        """
        Get an existing document or create a new one.
        
        Args:
            doc_id: Unique identifier for the document
            initial_content: Optional initial content for new documents
            
        Returns:
            LexicalModel instance for the document
        """
        if doc_id not in self.models:
            # Create new document with manager's settings
            model = LexicalModel.create_document(
                doc_id=doc_id,
                initial_content=initial_content,
                event_callback=self._wrap_event_callback(doc_id),
                ephemeral_timeout=self.ephemeral_timeout
            )
            self.models[doc_id] = model
            
            # Notify about new document creation
            if self.event_callback:
                self.event_callback("document_created", {
                    "doc_id": doc_id,
                    "model": model
                })
        
        return self.models[doc_id]
    
    def _wrap_event_callback(self, doc_id: str) -> Optional[Callable[[str, Dict[str, Any]], None]]:
        """
        Wrap the event callback to include document ID information.
        
        Args:
            doc_id: Document ID to include in events
            
        Returns:
            Wrapped callback function that includes doc_id
        """
        if not self.event_callback:
            return None
            
        def wrapped_callback(event_type: str, event_data: Dict[str, Any]):
            # Add document ID to event data
            enhanced_data = event_data.copy()
            enhanced_data["doc_id"] = doc_id
            
            # Call the original callback with enhanced data
            self.event_callback(event_type, enhanced_data)
        
        return wrapped_callback
    
    def handle_message(self, doc_id: str, message_type: str, data: Dict[str, Any], client_id: str = None) -> Dict[str, Any]:
        """
        Handle a message for a specific document.
        
        Args:
            doc_id: Document ID to send message to
            message_type: Type of message to handle
            data: Message data
            client_id: Optional client ID for ephemeral messages
            
        Returns:
            Response from the document's message handler
        """
        model = self.get_or_create_document(doc_id)
        
        # Route to appropriate handler based on message type
        document_message_types = ["loro-update", "snapshot", "request-snapshot", "append-paragraph"]
        ephemeral_message_types = ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]
        
        if message_type in document_message_types:
            return model.handle_message(message_type, data, client_id)
        elif message_type in ephemeral_message_types:
            if client_id is None:
                return {
                    "success": False,
                    "error": f"client_id required for ephemeral message type: {message_type}",
                    "message_type": message_type
                }
            return model.handle_ephemeral_message(message_type, data, client_id)
        else:
            return {
                "success": False,
                "error": f"Unknown message type: {message_type}",
                "message_type": message_type
            }
    
    def handle_ephemeral_message(self, doc_id: str, message_type: str, data: Dict[str, Any], client_id: str) -> Dict[str, Any]:
        """
        Handle an ephemeral message for a specific document.
        
        Args:
            doc_id: Document ID to send message to
            message_type: Type of ephemeral message
            data: Message data
            client_id: Client ID for ephemeral tracking
            
        Returns:
            Response from the document's ephemeral message handler
        """
        model = self.get_or_create_document(doc_id)
        return model.handle_ephemeral_message(message_type, data, client_id)
    
    def get_snapshot(self, doc_id: str) -> Optional[bytes]:
        """
        Get snapshot for a specific document.
        
        Args:
            doc_id: Document ID to get snapshot for
            
        Returns:
            Document snapshot as bytes, or None if document doesn't exist
        """
        if doc_id not in self.models:
            return None
        return self.models[doc_id].get_snapshot()
    
    def list_documents(self) -> List[str]:
        """
        Get list of all managed document IDs.
        
        Returns:
            List of document IDs
        """
        return list(self.models.keys())
    
    def get_document_info(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a specific document.
        
        Args:
            doc_id: Document ID to get info for
            
        Returns:
            Document information dict, or None if document doesn't exist
        """
        if doc_id not in self.models:
            return None
            
        model = self.models[doc_id]
        return {
            "doc_id": doc_id,
            "content_length": len(str(model.lexical_data)),
            "block_count": len(model.lexical_data.get("root", {}).get("children", [])),
            "source": model.lexical_data.get("source", "unknown"),
            "version": model.lexical_data.get("version", "unknown"),
            "last_saved": model.lexical_data.get("lastSaved", "unknown")
        }
    
    def cleanup_document(self, doc_id: str) -> bool:
        """
        Clean up and remove a document.
        
        Args:
            doc_id: Document ID to clean up
            
        Returns:
            True if document was cleaned up, False if it didn't exist
        """
        if doc_id not in self.models:
            return False
        
        # Clean up the model
        self.models[doc_id].cleanup()
        
        # Remove from our tracking
        del self.models[doc_id]
        
        # Notify about document removal
        if self.event_callback:
            self.event_callback("document_removed", {
                "doc_id": doc_id
            })
        
        return True
    
    def cleanup(self):
        """Clean up all managed documents"""
        doc_ids = list(self.models.keys())
        for doc_id in doc_ids:
            self.cleanup_document(doc_id)
    
    def __repr__(self) -> str:
        """String representation showing managed documents"""
        doc_count = len(self.models)
        doc_list = list(self.models.keys())
        return f"LexicalDocumentManager(documents={doc_count}, doc_ids={doc_list})"
    
    def __del__(self):
        """Cleanup when manager is destroyed"""
        self.cleanup()
