# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import json
import time
from typing import Dict, Any, List, Optional, TYPE_CHECKING
try:
    import loro
    from loro import ExportMode
except ImportError:
    # Fallback for when loro is not available
    loro = None
    ExportMode = None

if TYPE_CHECKING and loro is not None:
    from loro import LoroDoc


class LexicalModel:
    """
    A class that implements two-way binding between Lexical data structure and Loro documents.
    
    Manages two Loro documents:
    1. A text document with serialized content
    2. A structured document that mirrors the lexical structure with LoroMap and LoroArray
    """
    
    def __init__(self, text_doc: Optional['LoroDoc'] = None, structured_doc: Optional['LoroDoc'] = None, container_id: Optional[str] = None, change_callback: Optional[callable] = None):
        if loro is None:
            raise ImportError("loro package is required for LoroModel")
            
        # Initialize two Loro documents (use provided ones or create new)
        self.text_doc = text_doc if text_doc is not None else loro.LoroDoc()
        self.structured_doc = structured_doc if structured_doc is not None else loro.LoroDoc()
        
        # Store the container ID hint for syncing
        self.container_id = container_id
        
        # Store callback for notifying about changes
        self._change_callback = change_callback
        
        # Track if we need to subscribe to existing document changes
        self._text_doc_subscription = None
        
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
            # Initialize Loro documents with the base structure
            self._sync_to_loro()
    
    @classmethod
    def create_document(cls, doc_id: str, initial_content: Optional[str] = None, change_callback: Optional[callable] = None) -> 'LexicalModel':
        """
        Create a new LexicalModel with a Loro document initialized for the given doc_id.
        
        Args:
            doc_id: The container ID for the text content
            initial_content: Optional initial JSON content to seed the document
            change_callback: Optional callback for when the document changes
            
        Returns:
            A new LexicalModel instance with initialized Loro documents
        """
        if loro is None:
            raise ImportError("loro package is required for LexicalModel")
        
        # Create new Loro document
        doc = loro.LoroDoc()
        
        # Get text container using doc_id as container name
        text_container = doc.get_text(doc_id)
        
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
        
        # Create LexicalModel instance with the initialized document
        model = cls(text_doc=doc, container_id=doc_id, change_callback=change_callback)
        
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
                        
            # Try to find content in preferred order: container_id first, then common names
            if self.container_id:
                container_names_to_try = [self.container_id]
                # Only add fallbacks if container_id is not one of the common names
                if self.container_id not in ["content", "lexical-shared-doc", "shared-text"]:
                    container_names_to_try.extend(["content", "lexical-shared-doc", "shared-text"])
            else:
                container_names_to_try = ["content", "lexical-shared-doc", "shared-text"]
            
            # Add any containers we found in the document state that aren't already in the list
            container_names_to_try.extend([name for name, _ in potential_containers if name not in container_names_to_try])
            
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
        try:
            # Find which container actually has content - try container_id first
            active_container = None
            if self.container_id:
                container_names_to_try = [self.container_id]
            else:
                container_names_to_try = ["content", "lexical-shared-doc", "shared-text"]
            
            for container_name in container_names_to_try:
                try:
                    text_data = self.text_doc.get_text(container_name)
                    content = text_data.to_string()
                    if content and content.strip():
                        active_container = container_name
                        break
                except Exception:
                    continue
            
            # If no container has content, default to container_id or "content"
            if active_container is None:
                active_container = self.container_id or "content"
            
            # Subscribe to document changes - try different subscription patterns
            try:
                # Try the most common pattern first
                self._text_doc_subscription = self.text_doc.subscribe(
                    self._handle_text_doc_change
                )
                print(f"LoroModel: Set up document subscription (monitoring '{active_container}' container)")
            except TypeError:
                # Try with additional parameters that might be required
                try:
                    self._text_doc_subscription = self.text_doc.subscribe(
                        active_container, self._handle_text_doc_change
                    )
                    print(f"LoroModel: Set up container subscription for '{active_container}'")
                except TypeError:
                    # Try the observer pattern with container-specific subscription
                    text_container = self.text_doc.get_text(active_container)
                    self._text_doc_subscription = text_container.subscribe(
                        self._handle_text_doc_change
                    )
                    print(f"LoroModel: Set up text container subscription for '{active_container}'")
                    
        except Exception as e:
            # If subscription fails, we'll fall back to manual syncing
            print(f"Warning: Could not set up text_doc subscription: {e}")
            self._text_doc_subscription = None
    
    def _handle_text_doc_change(self, diff_event):
        """Handle changes to the text document using fine-grained diffs"""
        try:
            print(f"LoroModel: Received text doc change event")
            # Process each container diff in the event
            for container_diff in diff_event.events:
                # We're interested in changes to our text container
                if hasattr(container_diff, 'target') and hasattr(container_diff, 'diff'):
                    # Check if this is the container we care about
                    target_str = str(container_diff.target) if hasattr(container_diff.target, '__str__') else repr(container_diff.target)
                    print(f"LoroModel: Processing diff for target: {target_str}")
                    
                    # Check for our container_id or common container names
                    target_matches = False
                    if self.container_id and self.container_id in target_str:
                        target_matches = True
                    elif any(name in target_str for name in ['content', 'lexical-shared-doc', 'shared-text']):
                        target_matches = True
                    
                    if target_matches:
                        print(f"LoroModel: Applying text diff for {target_str}")
                        self._apply_text_diff(container_diff.diff)
                        # Auto-sync after receiving changes
                        self._auto_sync_on_change()
                    else:
                        print(f"LoroModel: Ignoring diff for {target_str} (not our container)")
                        
        except Exception as e:
            print(f"Warning: Error handling text document change event: {e}")
            # Fallback to full sync
            self._sync_from_loro_fallback()
    
    def _auto_sync_on_change(self):
        """Automatically sync and notify about changes"""
        try:
            # Sync from Loro to update our internal state
            self._sync_from_loro()
            
            # Notify the server/callback about the change if callback is set
            if self._change_callback:
                try:
                    self._change_callback(self)
                except Exception as e:
                    print(f"Warning: Error in change callback: {e}")
        except Exception as e:
            print(f"Warning: Error in auto-sync: {e}")
    
    def _sync_from_loro_fallback(self):
        """Fallback sync method when diff processing fails"""
        print("LoroModel: Using fallback sync")
        self._auto_sync_on_change()
    
    def _apply_text_diff(self, diff):
        """Apply text diff to update lexical_data incrementally"""
        try:
            if hasattr(diff, '__class__') and diff.__class__.__name__ == 'Text':
                # Get current content to work with
                current_content = self._get_current_text_content()
                
                # Apply text deltas to reconstruct the new content
                new_content = self._apply_text_deltas(current_content, diff.diff)
                
                if new_content and new_content != current_content:
                    # Parse the new content as JSON
                    try:
                        new_lexical_data = json.loads(new_content)
                        
                        # Compare and update blocks incrementally
                        self._update_lexical_data_incrementally(new_lexical_data)
                        
                        # Sync to structured document
                        self._sync_structured_doc_only()
                        
                    except json.JSONDecodeError as e:
                        print(f"Warning: Could not parse updated content as JSON: {e}")
                        
        except Exception as e:
            print(f"Warning: Error applying text diff: {e}")
    
    def _get_current_text_content(self) -> str:
        """Get current text content from the document"""
        # Try different container names - prioritize container_id if provided
        container_names_to_try = []
        if self.container_id:
            container_names_to_try.append(self.container_id)
        container_names_to_try.extend(["content", "lexical-shared-doc", "shared-text"])
        
        for container_name in container_names_to_try:
            try:
                text_data = self.text_doc.get_text(container_name)
                content = text_data.to_string()
                if content and content.strip():
                    return content
            except Exception:
                continue
        
        return ""
    
    def _apply_text_deltas(self, content: str, deltas) -> str:
        """Apply a sequence of text deltas to content"""
        result = content
        position = 0
        
        try:
            for delta in deltas:
                delta_class = delta.__class__.__name__
                
                if delta_class == 'Retain':
                    # Move position forward
                    position += delta.retain
                    
                elif delta_class == 'Insert':
                    # Insert text at current position
                    result = result[:position] + delta.insert + result[position:]
                    position += len(delta.insert)
                    
                elif delta_class == 'Delete':
                    # Delete text at current position
                    result = result[:position] + result[position + delta.delete:]
                    # Position stays the same after deletion
                    
        except Exception as e:
            print(f"Warning: Error applying text deltas: {e}")
            return content
            
        return result
    
    def _update_lexical_data_incrementally(self, new_lexical_data: Dict[str, Any]):
        """Update lexical_data incrementally by comparing with new data"""
        try:
            old_blocks = self.lexical_data.get("root", {}).get("children", [])
            new_blocks = new_lexical_data.get("root", {}).get("children", [])
            
            # Update metadata
            self.lexical_data["lastSaved"] = new_lexical_data.get("lastSaved", self.lexical_data["lastSaved"])
            self.lexical_data["source"] = new_lexical_data.get("source", self.lexical_data["source"])
            self.lexical_data["version"] = new_lexical_data.get("version", self.lexical_data["version"])
            
            # Compare blocks for fine-grained updates
            if len(old_blocks) != len(new_blocks):
                # Block count changed - update entire children array
                self.lexical_data["root"]["children"] = new_blocks
                print(f"LoroModel: Block count changed - {len(old_blocks)} -> {len(new_blocks)}")
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
                            print(f"LoroModel: Block {i} type changed - {old_type} -> {new_type}")
                        
                        # Check for text content changes
                        old_text = self._extract_block_text(old_block)
                        new_text = self._extract_block_text(new_block)
                        if old_text != new_text:
                            print(f"LoroModel: Block {i} text changed - '{old_text[:50]}...' -> '{new_text[:50]}...'")
                
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
    
    def _sync_to_loro(self):
        """Sync the current lexical_data to both Loro documents"""
        # Determine which container to write to (use container_id if available)
        target_container = self.container_id if self.container_id else "content"
        
        print(f"LoroModel: Syncing TO container '{target_container}'")
        
        # Update text document with serialized JSON
        text_data = self.text_doc.get_text(target_container)
        current_length = text_data.len_unicode
        if current_length > 0:
            text_data.delete(0, current_length)
        
        # For lexical-shared-doc, wrap in editorState format to match expected structure
        if target_container == "lexical-shared-doc":
            wrapped_data = {
                "editorState": self.lexical_data,
                "lastSaved": self.lexical_data["lastSaved"],
                "source": self.lexical_data["source"],
                "version": self.lexical_data["version"]
            }
            text_data.insert(0, json.dumps(wrapped_data))
            print(f"LoroModel: Wrote wrapped editorState format to '{target_container}'")
        else:
            # For content container, use direct format
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
    
    def _sync_from_loro(self):
        """Sync data from Loro documents back to lexical_data"""
        print(f"LoroModel: Starting _sync_from_loro() with container_id='{self.container_id}'")
        
        # If we have a specific container_id, only try that one
        # Otherwise fall back to common container names
        if self.container_id:
            container_names_to_try = [self.container_id]
        else:
            container_names_to_try = ["content", "lexical-shared-doc", "shared-text"]
        
        print(f"LoroModel: Will try containers: {container_names_to_try}")
        
        for container_name in container_names_to_try:
            try:
                print(f"LoroModel: Trying container '{container_name}'")
                text_data = self.text_doc.get_text(container_name)
                content = text_data.to_string()
                print(f"LoroModel: Container '{container_name}' content length: {len(content) if content else 0}")
                
                if content and content.strip():
                    try:
                        parsed_data = json.loads(content)
                        
                        # Handle both direct lexical format and editorState wrapper
                        if isinstance(parsed_data, dict):
                            if "root" in parsed_data:
                                # Direct lexical format
                                old_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                new_block_count = len(parsed_data.get("root", {}).get("children", []))
                                self.lexical_data = parsed_data
                                print(f"LoroModel: Successfully synced from '{container_name}' - blocks {old_block_count} -> {new_block_count}")
                                return  # Successfully synced
                            elif "editorState" in parsed_data and isinstance(parsed_data["editorState"], dict) and "root" in parsed_data["editorState"]:
                                # editorState wrapper format
                                editor_state = parsed_data["editorState"]
                                old_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                new_block_count = len(editor_state.get("root", {}).get("children", []))
                                self.lexical_data = {
                                    "root": editor_state["root"],
                                    "lastSaved": parsed_data.get("lastSaved", int(time.time() * 1000)),
                                    "source": parsed_data.get("source", "Lexical Loro"),
                                    "version": parsed_data.get("version", "0.34.0")
                                }
                                print(f"LoroModel: Successfully synced from '{container_name}' (editorState format) - blocks {old_block_count} -> {new_block_count}")
                                return  # Successfully synced
                        else:
                            print(f"LoroModel: Container '{container_name}' data is not a dict: {type(parsed_data)}")
                    except json.JSONDecodeError as e:
                        print(f"LoroModel: Container '{container_name}' has invalid JSON: {e}")
                        continue
                else:
                    print(f"LoroModel: Container '{container_name}' is empty or whitespace")
            except Exception as e:
                print(f"LoroModel: Error accessing container '{container_name}': {e}")
                continue
        
        # If no valid content found, keep current data
        print("LoroModel: No valid content found in any text container during sync")
    
    def _sync_from_any_available_container(self):
        """
        Sync from any available container that has content after import/update operations.
        This is useful when importing snapshots or applying updates that may create new containers.
        """
        try:
            # Get all available containers from the document
            doc_state = self.text_doc.get_deep_value()
            available_containers = []
            
            if isinstance(doc_state, dict):
                for key, value in doc_state.items():
                    if isinstance(value, str) and value.strip():
                        available_containers.append((key, len(value.strip())))
            
            print(f"LoroModel: Found {len(available_containers)} containers with content after import/update")
            
            # Try containers in order of content length (longest first, likely the main content)
            available_containers.sort(key=lambda x: x[1], reverse=True)
            
            for container_name, content_length in available_containers:
                try:
                    print(f"LoroModel: Trying container '{container_name}' with {content_length} chars")
                    text_container = self.text_doc.get_text(container_name)
                    content = text_container.to_string()
                    
                    if content and content.strip():
                        try:
                            parsed_data = json.loads(content.strip())
                            
                            if isinstance(parsed_data, dict):
                                # Check for direct Lexical format
                                if "root" in parsed_data and isinstance(parsed_data["root"], dict):
                                    # Direct lexical format
                                    old_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                    self.lexical_data = parsed_data
                                    new_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                    print(f"LoroModel: Successfully synced from '{container_name}' (direct format) - blocks {old_block_count} -> {new_block_count}")
                                    
                                    # Update our container_id to the one that actually has content
                                    self.container_id = container_name
                                    print(f"LoroModel: Updated container_id to '{container_name}'")
                                    
                                    # Sync to structured document
                                    self._sync_structured_doc_only()
                                    return True
                                    
                                elif "editorState" in parsed_data and isinstance(parsed_data["editorState"], dict):
                                    # editorState wrapper format
                                    editor_state = parsed_data["editorState"]
                                    old_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                    self.lexical_data = {
                                        "root": editor_state["root"],
                                        "lastSaved": parsed_data.get("lastSaved", int(time.time() * 1000)),
                                        "source": parsed_data.get("source", "Lexical Loro"),
                                        "version": parsed_data.get("version", "0.34.0")
                                    }
                                    new_block_count = len(self.lexical_data.get("root", {}).get("children", []))
                                    print(f"LoroModel: Successfully synced from '{container_name}' (editorState format) - blocks {old_block_count} -> {new_block_count}")
                                    
                                    # Update our container_id to the one that actually has content
                                    self.container_id = container_name
                                    print(f"LoroModel: Updated container_id to '{container_name}'")
                                    
                                    # Sync to structured document
                                    self._sync_structured_doc_only()
                                    return True
                                    
                        except json.JSONDecodeError:
                            print(f"LoroModel: Container '{container_name}' has invalid JSON")
                            continue
                            
                except Exception as e:
                    print(f"LoroModel: Error processing container '{container_name}': {e}")
                    continue
            
            print("LoroModel: No valid lexical content found in any container after import/update")
            return False
            
        except Exception as e:
            print(f"LoroModel: Error during _sync_from_any_available_container: {e}")
            return False
    
    
    def add_block(self, block_detail: Dict[str, Any], block_type: str):
        """
        Add a new block to the lexical model
        
        Args:
            block_detail: Dictionary containing block details (text, formatting, etc.)
            block_type: Type of block (paragraph, heading1, heading2, etc.)
        """
        try:
            # Sync from Loro to get the latest state
            self._sync_from_loro()
            
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
            
            # Sync to Loro documents
            self._sync_to_loro()
            print(f"✅ Synced to Loro documents successfully")
            
        except Exception as e:
            print(f"❌ Error adding block to lexical data: {e}")
            print(f"❌ Lexical data structure: {self.lexical_data}")
            raise e
    
    def get_blocks(self) -> List[Dict[str, Any]]:
        """Get all blocks from the lexical model"""
        self._sync_from_loro()
        return self.lexical_data["root"]["children"]
    
    def get_lexical_data(self) -> Dict[str, Any]:
        """Get the complete lexical data structure"""
        self._sync_from_loro()
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
                self._sync_to_loro()
    
    def remove_block(self, index: int):
        """Remove a block by index"""
        if 0 <= index < len(self.lexical_data["root"]["children"]):
            self.lexical_data["root"]["children"].pop(index)
            self.lexical_data["lastSaved"] = int(time.time() * 1000)
            self._sync_to_loro()
    
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
        self._sync_to_loro()
    
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
        
        return (f"LoroModel(blocks={len(blocks)}, "
                f"block_types={block_types}, "
                f"source='{self.lexical_data.get('source', 'unknown')}', "
                f"version='{self.lexical_data.get('version', 'unknown')}', "
                f"lastSaved={last_saved}, "
                f"mode={subscription_status})")
    
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
            
            # Import the snapshot into our text document
            self.text_doc.import_(snapshot)
            
            # After import, look for content in any available container
            # since the snapshot may have created new containers
            self._sync_from_any_available_container()
            
            print(f"✅ Successfully imported snapshot ({len(snapshot)} bytes)")
            return True
            
        except Exception as e:
            print(f"❌ Error importing snapshot: {e}")
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
            
            # Apply the update to our text document
            self.text_doc.import_(update_bytes)
            
            # After applying update, look for content in any available container
            # since the update may have created new containers or updated existing ones
            self._sync_from_any_available_container()
            
            print(f"✅ Successfully applied update ({len(update_bytes)} bytes)")
            return True
            
        except Exception as e:
            print(f"❌ Error applying update: {e}")
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
    
    def cleanup(self):
        """Clean up subscriptions and resources"""
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
    
    def __del__(self):
        """Cleanup when object is destroyed"""
        self.cleanup()
