#!/usr/bin/env python3

import asyncio
import json
import logging
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Optional, Callable
import websockets
from websockets.server import serve
from loro import LoroDoc, ExportMode, EphemeralStore
from ..constants import DEFAULT_TREE_NAME
from ..model.lexical_converter import (
    initialize_loro_doc_with_lexical_content,
    loro_tree_to_lexical_json,
    lexical_to_loro_tree
)

logger = logging.getLogger(__name__)

# Initial Lexical JSON structure for new documents
INITIAL_LEXICAL_JSON = """{
    "root": {
        "children": [
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Lexical with Loro",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": null,
                "format": "",
                "indent": 0,
                "type": "heading",
                "version": 1,
                "tag": "h1"
            },
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Type something...",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": null,
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1,
                "textFormat": 0,
                "textStyle": ""
            }
        ],
        "direction": null,
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    }
}"""

# Message type constants (matching TypeScript implementation)
MESSAGE_UPDATE = 'update'
MESSAGE_QUERY_SNAPSHOT = 'query-snapshot'
MESSAGE_EPHEMERAL = 'ephemeral'
MESSAGE_QUERY_EPHEMERAL = 'query-ephemeral'

def default_load_model(doc_id: str) -> Optional[str]:
    """
    Default load_model implementation - loads from local .models folder.
    Handles subdirectories for doc_ids with slashes.
    
    Args:
        doc_id: Document ID to load (may contain slashes for subdirectories)
        
    Returns:
        Content string from saved file, or None if no saved file exists
    """
    try:
        # Check if a saved model exists
        models_dir = Path(".models")
        # Convert doc_id to path, handling slashes as subdirectories
        model_file = models_dir / f"{doc_id}.json"
        
        if model_file.exists():
            with open(model_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    logger.debug(f"📂 [Persistence] Loaded existing model {doc_id} from {model_file}")
                    return content
        
        # No existing file found, return None to indicate no persisted content
        logger.debug(f"📂 [Persistence] No existing content found for '{doc_id}'")
        return None
        
    except Exception as e:
        logger.warning(f"⚠️ [Persistence] Error loading model {doc_id}: {e}")
        return None

def default_save_model(doc_id: str, lexical_json: str) -> bool:
    """
    Default save_model implementation - saves to local .models folder.
    Handles subdirectories for doc_ids with slashes.
    
    Args:
        doc_id: Document ID (may contain slashes for subdirectories)
        lexical_json: Lexical JSON content as string to save
        
    Returns:
        True if save successful, False otherwise
    """
    try:
        # Create .models directory if it doesn't exist
        models_dir = Path(".models")
        models_dir.mkdir(exist_ok=True)
        
        # Convert doc_id to path, handling slashes as subdirectories
        model_file = models_dir / f"{doc_id}.json"
        
        # Create parent directories if they don't exist
        model_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(model_file, 'w', encoding='utf-8') as f:
            f.write(lexical_json)
        
        logger.debug(f"💾 [Persistence] Saved model {doc_id} to {model_file}")
        return True
        
    except Exception as e:
        logger.error(f"❌ [Persistence] Failed to save model {doc_id}: {e}")
        return False



@dataclass
class EphemeralMessage:
    type: str = MESSAGE_EPHEMERAL
    ephemeral: list = None
    docId: str = ""

class WSSharedDoc:
    def __init__(self, name: str, 
                 load_model: Optional[Callable[[str], Optional[str]]] = None,
                 save_model: Optional[Callable[[str, str], bool]] = None):
        self.name = name
        self.load_model = load_model or default_load_model
        self.save_model = save_model or default_save_model
        self.last_save_time = 0
        self.has_changes_since_save = False
        
        # Create actual Loro document
        self.doc = LoroDoc()
        
        # Load from persistence first
        content_loaded = self._load_from_persistence()
        
        # Initialize with proper Lexical content structure if needed (only if no content was loaded)
        if not content_loaded:
            try:
                logger.debug(f"[Server] No persisted content found, initializing with default Lexical content")
                initialize_loro_doc_with_lexical_content(self.doc, logger)
                self.doc.commit()
                self.has_changes_since_save = True  # Mark as changed for initial save
                logger.debug(f"[Server] Successfully initialized document with default Lexical content")
                
                # Verify initialization
                tree = self.doc.get_tree(DEFAULT_TREE_NAME)
                final_nodes = tree.nodes()  # method
                final_roots = tree.roots     # property
                logger.debug(f"[Server] After initialization - nodes: {len(final_nodes)}, roots: {len(final_roots)}")
                
            except Exception as e:
                logger.error(f"[Server] Error initializing document with Lexical content: {e}")
                # Fallback to empty document
                try:
                    tree = self.doc.get_tree(DEFAULT_TREE_NAME)
                    root_id = tree.create()
                    self.doc.commit()
                    self.has_changes_since_save = True
                    logger.warning(f"[Server] Fallback: Created basic empty document")
                except Exception as fallback_e:
                    logger.error(f"[Server] Even fallback initialization failed: {fallback_e}")
        else:
            logger.debug(f"[Server] Document restored from persistence, skipping initialization")
            # Log what content exists
            try:
                tree = self.doc.get_tree(DEFAULT_TREE_NAME)
                roots = tree.roots
                for i, root_id in enumerate(roots[:3]):  # First 3 roots
                    try:
                        meta_map = tree.get_meta(root_id)
                        element_type = meta_map.get('elementType', 'unknown')
                        logger.debug(f"[Server] Existing root {i}: {root_id} -> type: {element_type}")
                    except Exception as e:
                        logger.debug(f"[Server] Error reading root {i}: {e}")
            except Exception as e:
                logger.debug(f"[Server] Error accessing restored document content: {e}")
        
        self.conns = {}
        # Initialize proper Loro EphemeralStore with 30 second timeout (matching Node.js server)
        self.ephemeral_store = EphemeralStore(30000)  # 30 seconds timeout
        self.last_ephemeral_sender = None
        
        # Subscribe to ephemeral store changes to broadcast updates (like Node.js server)
        def ephemeral_change_handler(event):
            """Handle ephemeral store changes and broadcast to other connections"""
            # Only broadcast if there are actual changes
            if (hasattr(event, 'added') and len(event.added) > 0) or \
               (hasattr(event, 'updated') and len(event.updated) > 0) or \
               (hasattr(event, 'removed') and len(event.removed) > 0):
                try:
                    encoded_data = self.ephemeral_store.encode_all()
                    
                    # Skip broadcast if no actual data to send
                    if len(encoded_data) == 0:
                        return
                    
                    # MESSAGE_EPHEMERAL and EphemeralMessage are defined locally in this file
                    message = EphemeralMessage(
                        type=MESSAGE_EPHEMERAL,
                        ephemeral=list(encoded_data),
                        docId=self.name
                    )
                    
                    # Broadcast to all connections EXCEPT the one that sent the last ephemeral update
                    broadcast_count = 0
                    for conn in self.conns:
                        if conn != self.last_ephemeral_sender:
                            try:
                                # Use asyncio to handle the async send
                                import asyncio
                                import json
                                from dataclasses import asdict
                                asyncio.create_task(conn.send(json.dumps(asdict(message))))
                                broadcast_count += 1
                            except Exception as send_error:
                                logger.warn(f"[Server] ephemeral_change_handler - Failed to send to conn: {send_error}")
                    
                    logger.debug(f"📡 SERVER DEBUG - Broadcasted ephemeral changes to {broadcast_count} connections")
                    
                    # Clear the sender reference after broadcast
                    self.last_ephemeral_sender = None
                    
                except Exception as broadcast_error:
                    logger.error(f"[Server] ephemeral_change_handler - ERROR broadcasting: {broadcast_error}")
        
        # Subscribe to the ephemeral store changes
        self.ephemeral_store.subscribe(ephemeral_change_handler)
        
        logger.debug(f"[Server] Initialized document '{name}' with Loro tree structure")
    
    def _load_from_persistence(self):
        """Load document content from persistence if available and convert to Loro tree structure"""
        try:
            logger.debug(f"📂 [Persistence] Loading document '{self.name}' from storage")
            
            # Load Lexical JSON content
            lexical_content = self.load_model(self.name)
            if not lexical_content:
                logger.debug(f"📂 [Persistence] No existing content found for '{self.name}', will use initial content")
                return False  # Indicate no content was loaded
            
            # Parse the JSON to validate it
            try:
                lexical_data = json.loads(lexical_content)
                logger.debug(f"📂 [Persistence] Successfully loaded existing content for '{self.name}'")
                
                # Convert Lexical JSON back to Loro tree structure
                tree = self.doc.get_tree(DEFAULT_TREE_NAME)
                tree.enable_fractional_index(1)
                
                # Convert the loaded Lexical JSON to Loro tree
                root_id = lexical_to_loro_tree(lexical_data, tree, logger)
                self.doc.commit()
                
                logger.debug(f"📂 [Persistence] Successfully restored document '{self.name}' from persistence")
                return True  # Indicate content was loaded and applied
                
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ [Persistence] Invalid JSON in stored content for '{self.name}': {e}")
                return False
                
        except Exception as e:
            logger.error(f"❌ [Persistence] Error loading document '{self.name}': {e}")
            return False
    
    def save_to_persistence(self) -> bool:
        """Save current document state to persistence"""
        try:
            if not self.has_changes_since_save:
                logger.debug(f"⏭️ [Persistence] No changes to save for document '{self.name}'")
                return True
            
            logger.debug(f"💾 [Persistence] Saving document '{self.name}' to storage")
            
            # Convert current Loro tree to Lexical JSON
            lexical_json = loro_tree_to_lexical_json(self.doc, logger)
            
            # Save using the save function
            success = self.save_model(self.name, lexical_json)
            
            if success:
                self.has_changes_since_save = False
                self.last_save_time = time.time()
                logger.debug(f"✅ [Persistence] Successfully saved document '{self.name}'")
            else:
                logger.error(f"❌ [Persistence] Failed to save document '{self.name}'")
            
            return success
            
        except Exception as e:
            logger.error(f"❌ [Persistence] Error saving document '{self.name}': {e}")
            return False
    
    def mark_changed(self):
        """Mark the document as having changes since last save"""
        self.has_changes_since_save = True
    
    def needs_save(self) -> bool:
        """Check if document needs to be saved"""
        return self.has_changes_since_save

# Global document storage
docs = {}

# Global persistence functions
global_load_model = default_load_model
global_save_model = default_save_model

def set_persistence_functions(load_func: Optional[Callable[[str], Optional[str]]] = None,
                            save_func: Optional[Callable[[str, str], bool]] = None):
    """Set global persistence functions for all documents"""
    global global_load_model, global_save_model
    global_load_model = load_func or default_load_model
    global_save_model = save_func or default_save_model
    logger.debug(f"[Persistence] Updated global persistence functions")

def clear_docs():
    """Clear all cached documents - useful for server restarts"""
    global docs
    docs.clear()
    logger.debug(f"[Server] Cleared document cache")

def get_doc(docname: str):
    if docname not in docs:
        docs[docname] = WSSharedDoc(docname, global_load_model, global_save_model)
    return docs[docname]

def save_all_docs() -> Dict[str, bool]:
    """Save all documents to persistence"""
    results = {}
    logger.debug(f"💾 [Persistence] Saving all {len(docs)} documents")
    
    for doc_name, doc in docs.items():
        try:
            results[doc_name] = doc.save_to_persistence()
        except Exception as e:
            logger.error(f"❌ [Persistence] Error saving document '{doc_name}': {e}")
            results[doc_name] = False
    
    saved_count = sum(1 for success in results.values() if success)
    logger.debug(f"✅ [Persistence] Saved {saved_count}/{len(docs)} documents")
    return results

def close_conn(doc, conn):
    if conn in doc.conns:
        conn_id = f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown"
        client_id = getattr(conn, 'client_id', None)
        display_id = client_id if client_id else conn_id
        
        print(f"\n💔💔💔 [server:py:ws] CONNECTION CLOSED: {display_id} (was {conn_id}) ← document: {doc.name} 💔💔💔")
        logger.info(f"[server:py:ws] CONNECTION CLOSED: {display_id} ← document: {doc.name}")
        if client_id:
            logger.info(f"🔗 [CORRELATION] Closed Frontend clientID: {client_id} (WebSocket {conn_id})")
        
        logger.debug(f"💔 [Server] *** CONNECTION CLOSING *** for document: {doc.name}")
        logger.debug(f"💔 [Server] Closing connection: {conn}")
        del doc.conns[conn]
        logger.debug(f"💔 [Server] Remaining connections for document {doc.name}: {len(doc.conns)}")
        logger.debug(f"💔 [Server] Remaining connections list: {list(doc.conns.keys())}")
    else:
        logger.warning(f"⚠️ [Server] Tried to cleanup connection {conn} but it wasn't in doc.conns")

async def message_listener(conn, doc, message):
    # Get display ID (client ID if available, otherwise connection ID)
    conn_id = f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown"
    display_id = getattr(conn, 'client_id', conn_id)
    
    try:
        message_data = None
        message_str = ""
        
        if isinstance(message, str):
            message_str = message
            logger.info(f"📝 [Server] String message from {display_id}: {message_str[:100]}...")
        elif isinstance(message, bytes):
            try:
                message_str = message.decode('utf-8')
                logger.info(f"📝 [Server] Decoded bytes from {display_id}: {message_str[:100]}...")
            except UnicodeDecodeError:
                logger.info(f"💾 [Server] Binary Loro update from {display_id}: {len(message)} bytes")
                logger.debug(f"[Server] Received binary Loro update: {len(message)} bytes")
                # Apply the update to the document
                doc.doc.import_(message)
                # Mark document as changed for persistence
                doc.mark_changed()
                logger.debug(f"💾 [Persistence] Marked document '{doc.name}' as changed (binary update)")
                
                # Broadcast to other connections
                for c in doc.conns:
                    if c != conn:
                        await c.send(message)
                return
        else:
            logger.warning(f"[Server] Unknown message type: {type(message)}")
            return
        
        if not message_str:
            return
        
        try:
            message_data = json.loads(message_str)
        except json.JSONDecodeError as e:
            logger.warning(f"[Server] JSON parse error: {e}")
            return
        
        message_type = message_data.get("type", "")
        display_id = getattr(conn, 'client_id', f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown")
        logger.debug(f"[Server] Received message type: {message_type} for doc: {doc.name}")
        
        if message_type == MESSAGE_QUERY_SNAPSHOT:
            await handle_query_snapshot(conn, doc, message_data)
        elif message_type == MESSAGE_EPHEMERAL:
            await handle_ephemeral(conn, doc, message_data)
        elif message_type == MESSAGE_QUERY_EPHEMERAL:
            await handle_query_ephemeral(conn, doc, message_data)
        elif message_type == MESSAGE_UPDATE:
            await handle_update(conn, doc, message_data)
        elif message_type == "keepalive":
            await handle_keepalive(conn, doc, message_data)
        else:
            logger.warning(f"[Server] Unknown message type: {message_type}")
            
    except Exception as e:
        logger.error(f"[Server] Message handling error: {e}")

async def handle_query_snapshot(conn, doc, message_data):
    try:
        request_id = str(time.time())
        logger.debug(f"[Server] Client requesting snapshot for doc: {doc.name} (Request ID: {request_id})")
        
        # Export actual Loro document snapshot
        snapshot = doc.doc.export(ExportMode.Snapshot())
        logger.debug(f"[Server] Sending snapshot response: {len(snapshot)} bytes")
        
        # Log tree structure for debugging
        tree = doc.doc.get_tree(DEFAULT_TREE_NAME)
        nodes = tree.nodes()  # method call
        logger.debug(f"[Server] Snapshot contains {len(nodes)} nodes from server document")
        
        await conn.send(snapshot)
        
    except Exception as e:
        logger.error(f"[Server] Error handling query-snapshot: {e}")
        import traceback
        logger.error(f"[Server] Traceback: {traceback.format_exc()}")

async def handle_ephemeral(conn, doc, message_data):
    try:
        ephemeral_data = message_data.get("ephemeral", [])
        conn_id = f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown"
        logger.info(f"📡 [Server] Processing ephemeral data: {len(ephemeral_data)} bytes from {conn_id}")
        
        # Mark this connection as sender to avoid echo
        doc.last_ephemeral_sender = conn
        
        # Debug: Check ephemeral store state before applying
        before_states = doc.ephemeral_store.get_all_states()
        before_keys = list(before_states.keys())
        
        # Apply ephemeral update using proper Loro EphemeralStore API
        ephemeral_bytes = bytes(ephemeral_data)
        doc.ephemeral_store.apply(ephemeral_bytes)
        
        # Debug: Check state after applying and extract client ID
        after_states = doc.ephemeral_store.get_all_states()
        after_keys = list(after_states.keys())
        
        # Extract the client ID for this connection from the new keys
        new_keys = [k for k in after_keys if k not in before_keys]
        
        # Filter to only numeric keys (client IDs)
        new_client_ids = []
        for key in new_keys:
            try:
                # Check if the key is a valid client ID (numeric string)
                int(key)
                new_client_ids.append(key)
            except ValueError:
                # Skip non-numeric keys
                pass
        
        if new_client_ids:
            # Now keys are direct client IDs, so we can use the first new client ID
            client_id = new_client_ids[0]  # Get the first new client ID (e.g., "1172255969499")
            logger.info(f"🎭 [Server] CLIENT ID DETECTED: {conn_id} → {client_id}")
            # Store the client ID mapping for future reference
            if not hasattr(conn, 'client_id'):
                conn.client_id = client_id
                logger.info(f"🆔 [Server] MAPPED CONNECTION: {conn_id} ↔ {client_id}")
                # Also log in a format that makes correlation easy
                logger.info(f"🔗 [CORRELATION] WebSocket {conn_id} maps to Frontend clientID: {client_id}")
        
        # Use client ID in logging if available
        display_id = getattr(conn, 'client_id', conn_id)
        
        logger.info(f"📡 [Server] Ephemeral update applied for {display_id} (was {conn_id})")
        logger.debug(f"📡 SERVER DEBUG - Applied ephemeral update from {display_id}: "
                    f"bytes_length={len(ephemeral_bytes)}, "
                    f"before_keys={before_keys}, "
                    f"after_keys={after_keys}, "
                    f"new_client_ids={new_client_ids}, "
                    f"total_connections={len(doc.conns)}")
        
    except Exception as e:
        logger.error(f"[Server] Error handling ephemeral: {e}")
        doc.last_ephemeral_sender = None

async def handle_query_ephemeral(conn, doc, message_data):
    logger.info(f"❓👻❓ [Server] HANDLE_QUERY_EPHEMERAL CALLED ❓👻❓")
    try:
        # Get all current ephemeral state using proper Loro EphemeralStore API
        all_states = doc.ephemeral_store.get_all_states()
        all_keys = list(all_states.keys())
        ephemeral_update = doc.ephemeral_store.encode_all()
        
        logger.info(f"📊 [Server] Ephemeral query - all_keys: {all_keys}, encoded_length: {len(ephemeral_update)}")
        logger.debug(f"📡 SERVER DEBUG - Client conn {id(conn)} requesting ephemeral state: "
                    f"all_keys_available={all_keys}, "
                    f"encoded_length={len(ephemeral_update)}, "
                    f"total_connections={len(doc.conns)}")
        
        response = EphemeralMessage(
            type=MESSAGE_EPHEMERAL,
            ephemeral=list(ephemeral_update),
            docId=doc.name
        )
        
        await conn.send(json.dumps(asdict(response)))
        
    except Exception as e:
        logger.error(f"[Server] Error handling query ephemeral: {e}")
        doc.last_ephemeral_sender = None

async def handle_keepalive(conn, doc, message_data):
    """Handle keepalive messages from MCP clients"""
    try:
        ping_id = message_data.get("ping_id", "unknown")
        timestamp = message_data.get("timestamp", "unknown")
        reason = message_data.get("reason", "regular_keepalive")
        error_info = message_data.get("error", None)
        
        logger.debug(f"💓 [Server] *** RECEIVED KEEPALIVE #{ping_id} *** from conn-{conn.remote_address[0]}:{conn.remote_address[1]} for doc: {doc.name}")
        logger.debug(f"💓 [Server] Keepalive timestamp: {timestamp}")
        logger.debug(f"💓 [Server] Keepalive reason: {reason}")
        logger.debug(f"💓 [Server] Current server time: {time.time()}")
        
        if error_info:
            logger.warning(f"💓 [Server] Keepalive indicated client error: {error_info}")
        
        # Send a keepalive response back to acknowledge
        keepalive_response = {
            "type": "keepalive_ack",
            "doc_id": doc.name,
            "ping_id": ping_id,
            "server_timestamp": time.time(),
            "acknowledged": True
        }
        
        logger.debug(f"💓 [Server] *** SENDING KEEPALIVE ACK #{ping_id} *** to conn-{conn.remote_address[0]}:{conn.remote_address[1]}")
        logger.debug(f"💓 [Server] ACK message: {keepalive_response}")
        
        await conn.send(json.dumps(keepalive_response))
        
        logger.debug(f"✅ [Server] *** KEEPALIVE ACK #{ping_id} SENT *** - connection maintained")
        
    except Exception as e:
        logger.error(f"💔 [Server] Error handling keepalive: {e}")
        logger.error(f"💔 [Server] Keepalive message data: {message_data}")
        # Don't propagate error - keepalive failure shouldn't break the connection

async def handle_update(conn, doc, message_data):
    try:
        update_data = message_data.get("update", [])
        logger.debug(f"[Server] Received update: {len(update_data)} bytes")
        
        # Apply update to Loro document
        if update_data:
            update_bytes = bytes(update_data)
            doc.doc.import_(update_bytes)
            # Mark document as changed for persistence
            doc.mark_changed()
            logger.debug(f"💾 [Persistence] Marked document '{doc.name}' as changed")
        
        # Broadcast to other connections
        logger.debug(f"[Server] *** STARTING BROADCAST TO OTHER CONNECTIONS ***")
        logger.debug(f"[Server] Total connections for doc '{doc.name}': {len(doc.conns)}")
        logger.debug(f"[Server] Sender connection: {conn}")
        logger.debug(f"[Server] All connections: {list(doc.conns.keys())}")
        
        # Create a copy of connections to avoid "dictionary changed size during iteration" error
        connections_copy = list(doc.conns.keys())
        logger.debug(f"[Server] Created connections copy with {len(connections_copy)} connections")
        
        broadcast_count = 0
        for c in connections_copy:
            logger.debug(f"[Server] Checking connection {c} (sender: {c == conn})")
            # Check if connection is still in the active connections (might have been removed)
            if c not in doc.conns:
                logger.debug(f"⚠️ [Server] Connection {c} no longer active, skipping")
                continue
                
            if c != conn:
                logger.debug(f"🚀 [Server] Broadcasting update to different connection: {c}")
                try:
                    await c.send(json.dumps(message_data))
                    broadcast_count += 1
                    logger.debug(f"✅ [Server] Successfully sent update to connection {c}")
                except Exception as send_error:
                    logger.error(f"❌ [Server] Failed to send update to connection {c}: {send_error}")
            else:
                logger.debug(f"⏭️ [Server] Skipping sender connection: {c}")
        
        logger.debug(f"[Server] *** BROADCAST COMPLETE *** - Sent to {broadcast_count} connections")
        
    except Exception as e:
        logger.error(f"[Server] Error handling update: {e}")
        import traceback
        logger.error(f"[Server] Traceback: {traceback.format_exc()}")

async def setup_ws_connection(conn, path: str):
    doc_name = path.strip('/').split('?')[0] if path else 'default'
    if not doc_name:
        doc_name = 'default'
    
    conn_id = f"conn-{conn.remote_address[0]}:{conn.remote_address[1]}" if conn.remote_address else "unknown"
    
    # Add prominent logging that appears right after websockets.server connection logs
    print(f"\n🔥🔥🔥 [server:py:ws] CONNECTION ESTABLISHED: {conn_id} → document: {doc_name} 🔥🔥🔥")
    logger.info(f"[server:py:ws] CONNECTION ID: {conn_id} → document: {doc_name} (awaiting clientID)")
    logger.info(f"🔗 [CORRELATION] WebSocket {conn_id} awaiting Frontend clientID mapping...")
    logger.info(f"🔥🔥🔥 [Server] NEW CONNECTION STARTED: {conn_id} for document: {doc_name} 🔥🔥🔥")
    logger.debug(f"🔗 [Server] *** NEW CONNECTION *** {conn_id} for document: {doc_name}")
    
    doc = get_doc(doc_name)
    doc.conns[conn] = set()
    
    logger.info(f"📊 [server:py:ws] Total connections for '{doc_name}': {len(doc.conns)} (including {conn_id})")
    logger.debug(f"🔗 [Server] Total connections now: {len(doc.conns)}")
    logger.debug(f"🔗 [Server] All connections: {list(doc.conns.keys())}")
    
    try:
        # Send initial snapshot using actual Loro document
        initial_snapshot = doc.doc.export(ExportMode.Snapshot())
        logger.debug(f"[Server] Sending initial snapshot to new client: {len(initial_snapshot)} bytes")
        await conn.send(initial_snapshot)
        
        # Send current ephemeral state to new client using proper EphemeralStore API
        try:
            ephemeral_data = doc.ephemeral_store.encode_all()
            if len(ephemeral_data) > 0:
                ephemeral_message = EphemeralMessage(
                    type=MESSAGE_EPHEMERAL,
                    ephemeral=list(ephemeral_data),
                    docId=doc_name
                )
                await conn.send(json.dumps(asdict(ephemeral_message)))
                logger.debug(f"[Server] Sent initial ephemeral state to new client: {len(ephemeral_data)} bytes")
        except Exception as ephemeral_error:
            logger.warn(f"[Server] Failed to send initial ephemeral state: {ephemeral_error}")
        
        async for message in conn:
            await message_listener(conn, doc, message)
            
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"🚪 [server:py:ws] WebSocket connection {conn_id} closed normally")
        logger.debug(f"WebSocket connection {conn_id} closed")
    except Exception as e:
        logger.info(f"❌ [server:py:ws] WebSocket connection {conn_id} error: {e}")
        logger.error(f"WebSocket connection {conn_id} error: {e}")
    finally:
        close_conn(doc, conn)

async def start_server(host: str = "localhost", port: int = 3002, autosave_interval_sec: int = 60):
    """Start WebSocket server with persistence - legacy function"""
    logger.debug(f"Starting Loro WebSocket server on {host}:{port}")
    
    # Use the new server class
    server = LoroWebSocketServer(host, port, autosave_interval_sec)
    await server.start()
    
    return server


class LoroWebSocketServer:
    """WebSocket server class for CLI compatibility"""
    
    def __init__(self, host: str = "localhost", port: int = 3002, 
                 autosave_interval_sec: int = 60,
                 load_model: Optional[Callable[[str], Optional[str]]] = None,
                 save_model: Optional[Callable[[str, str], bool]] = None):
        self.host = host
        self.port = port
        self.autosave_interval_sec = autosave_interval_sec
        self.server = None
        self.running = False
        self._autosave_task: Optional[asyncio.Task] = None
        
        # Set up persistence functions
        set_persistence_functions(load_model, save_model)
        
    async def start(self):
        """Start the WebSocket server"""
        logger.debug(f"🚀 Starting LoroWebSocketServer")
        logger.debug(f"   Host: {self.host}")
        logger.debug(f"   Port: {self.port}")
        logger.debug(f"   Auto-save interval: {self.autosave_interval_sec} seconds")
        
        self.running = True
        
        # Clear any cached documents from previous runs
        clear_docs()
        
        async def handler(websocket, path):
            await setup_ws_connection(websocket, path)
        
        self.server = await serve(handler, self.host, self.port)
        logger.debug(f"✅ LoroWebSocketServer running on ws://{self.host}:{self.port}")
        
        # Start background autosave task
        logger.debug(f"🔄 Starting background services...")
        self._autosave_task = asyncio.create_task(self._autosave_models())
        logger.debug(f"   ✓ Auto-save service ({self.autosave_interval_sec}s interval)")
        
        try:
            # Keep the server running
            await self.server.wait_closed()
        finally:
            await self.stop()
        
    async def stop(self):
        """Stop the WebSocket server"""
        logger.debug("🛑 Stopping LoroWebSocketServer...")
        self.running = False
        
        # Cancel autosave task
        if self._autosave_task:
            self._autosave_task.cancel()
            try:
                await self._autosave_task
            except asyncio.CancelledError:
                pass
        
        # Perform final save of all documents
        logger.debug("💾 Performing final save of all documents...")
        save_results = save_all_docs()
        saved_count = sum(1 for success in save_results.values() if success)
        logger.debug(f"✅ Final save completed: {saved_count}/{len(save_results)} documents saved")
        
        # Close server
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.debug("✅ WebSocket server stopped")
    
    async def _autosave_models(self):
        """Periodically auto-save all models at the configured interval"""
        logger.debug(f"🚀 Auto-save task started with interval: {self.autosave_interval_sec} seconds")
        
        while self.running:
            try:
                await asyncio.sleep(self.autosave_interval_sec)
                if self.running:
                    logger.debug(f"🔍 Auto-save check: found {len(docs)} documents")
                    
                    if docs:
                        logger.debug(f"🔄 Auto-saving {len(docs)} documents...")
                        saved_count = 0
                        unchanged_count = 0
                        
                        for doc_name, doc in docs.items():
                            try:
                                if doc.needs_save():
                                    success = doc.save_to_persistence()
                                    if success:
                                        saved_count += 1
                                        logger.debug(f"💾 Auto-saved document: {doc_name}")
                                    else:
                                        logger.warning(f"⚠️ Auto-save failed for document: {doc_name}")
                                else:
                                    unchanged_count += 1
                                    logger.debug(f"⏭️ Skipping auto-save for unchanged document: {doc_name}")
                            except Exception as e:
                                logger.error(f"❌ Error auto-saving document {doc_name}: {e}")
                        
                        if saved_count > 0:
                            logger.debug(f"✅ Auto-save completed: {saved_count} saved, {unchanged_count} unchanged")
                        elif unchanged_count > 0:
                            logger.debug(f"ℹ️ Auto-save check: {unchanged_count} documents unchanged, none saved")
                    else:
                        logger.debug(f"🔍 No documents to auto-save")
                        
            except asyncio.CancelledError:
                logger.debug("🛑 Auto-save task cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in auto-save loop: {e}")
        
        logger.debug("✅ Auto-save task stopped")
    
    def save_all_models(self) -> Dict[str, bool]:
        """
        Manually save all models using the save_model function.
        
        Returns:
            Dictionary mapping doc_id to save success status
        """
        logger.debug(f"💾 Manually saving {len(docs)} documents...")
        return save_all_docs()


def main():
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    async def run_server():
        # Example of custom load/save functions (uncomment to use)
        
        # def custom_load_model(doc_id: str) -> Optional[str]:
        #     """Custom model loader - could load from database, API, etc."""
        #     try:
        #         # Example: Load from custom location
        #         custom_file = Path(f"custom_models/{doc_id}.json")
        #         if custom_file.exists():
        #             with open(custom_file, 'r', encoding='utf-8') as f:
        #                 return f.read()
        #     except Exception as e:
        #         logger.error(f"❌ Custom load error for {doc_id}: {e}")
        #     return None
        
        # def custom_save_model(doc_id: str, lexical_json: str) -> bool:
        #     """Custom model saver - could save to database, API, etc."""
        #     try:
        #         # Example: Save to custom location
        #         custom_dir = Path("custom_models")
        #         custom_dir.mkdir(exist_ok=True)
        #         custom_file = custom_dir / f"{doc_id}.json"
        #         with open(custom_file, 'w', encoding='utf-8') as f:
        #             f.write(lexical_json)
        #         return True
        #     except Exception as e:
        #         logger.error(f"❌ Custom save error for {doc_id}: {e}")
        #         return False
        
        # Create and start server with persistence
        server = LoroWebSocketServer(
            host="localhost",
            port=3002,
            autosave_interval_sec=5,
            # load_model=custom_load_model,
            # save_model=custom_save_model
        )
        
        try:
            await server.start()
        except KeyboardInterrupt:
            logger.debug("🛑 Shutting down server...")
        finally:
            await server.stop()
    
    try:
        asyncio.run(run_server())
    except KeyboardInterrupt:
        logger.debug("✅ Server shutdown complete")

if __name__ == "__main__":
    main()
