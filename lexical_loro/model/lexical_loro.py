# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
LoroTreeModel: Tree-based collaborative document model

This module replaces the JSON-based LexicalModel with a tree-based implementation
using Loro CRDT for real-time collaborative editing. The model maintains compatibility
with the existing MCP protocol while using trees for internal operations.

ARCHITECTURE OVERVIEW:
=====================

Tree-Based Document Structure:
- Primary Loro document with tree container
- TreeNodeMapper for lexical ↔ tree ID mapping  
- LexicalTreeConverter for JSON ↔ tree conversion
- Event system for collaborative synchronization

KEY DESIGN PRINCIPLES:
=====================

1. **Tree-First Operations**:
   - All document operations work directly on tree structure
   - Lexical JSON is used only for persistence and import/export

2. **Collaborative Safety**:
   - Tree operations are CRDT-safe by design
   - No destructive operations during collaboration

3. **Backward Compatibility**:
   - Same MCP interface as LexicalModel
   - Seamless migration for existing clients

4. **Performance Optimized**:
   - Efficient tree operations for large documents
   - Minimal conversion overhead

USAGE PATTERNS:
==============

✅ Initialization:
model = LoroTreeModel(doc_id="doc1")
model.initialize_from_lexical_state(lexical_json)

✅ Tree Operations:
model.add_block_to_tree(parent_key, block_data, index)
model.update_tree_node(node_key, new_data)
model.remove_tree_node(node_key)

✅ Export:
lexical_state = model.export_to_lexical_state()
model.save_document_state(file_path)
"""

import json
import logging
import time
import asyncio
import threading
from typing import Dict, Any, List, Optional, Callable, Union
from enum import Enum
import websockets
from loro import LoroDoc, EphemeralStore

from .lexical_converter import LexicalTreeConverter
from .node_mapper import TreeNodeMapper
from ..constants import DEFAULT_TREE_NAME

logger = logging.getLogger(__name__)


class TreeEventType(Enum):
    """Event types for tree-based operations"""
    TREE_NODE_CREATED = "tree_node_created"
    TREE_NODE_UPDATED = "tree_node_updated" 
    TREE_NODE_DELETED = "tree_node_deleted"
    DOCUMENT_CHANGED = "document_changed"
    BROADCAST_NEEDED = "broadcast_needed"


class LoroTreeModel:
    """
    Tree-based collaborative document model using Loro CRDT
    """

    def __init__(
        self,
        doc_id: str,
        tree_name: str = DEFAULT_TREE_NAME,
        enable_collaboration: bool = False,
        event_handler: Optional[Callable] = None
    ):
        """
        Initialize tree-based document model
        
        Args:
            doc_id: Unique document identifier
            tree_name: Name of the tree container (default: "lexical")
            enable_collaboration: Whether to enable collaborative features
            event_handler: Optional event handler for notifications
        """
        self.doc_id = doc_id
        self.tree_name = tree_name
        self.enable_collaboration = enable_collaboration
        self._event_handler = event_handler
        
        # Initialize Loro document and tree
        self.doc = LoroDoc()
        self.tree = self.doc.get_tree(tree_name)
        
        # Initialize helper classes
        self.converter = LexicalTreeConverter(self.doc, tree_name)
        self.mapper = TreeNodeMapper(self.doc, tree_name)
        
        # Document state
        self.root_tree_id: Optional[str] = None
        self._is_initialized = False
        self._modification_count = 0
        self._last_save_time = 0.0
        
        # Collaboration state
        self._ephemeral_store: Optional[EphemeralStore] = None
        self._subscription_id: Optional[str] = None
        
        # WebSocket client state
        self.websocket_url: str = "ws://localhost:3002"
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.websocket_connected: bool = False
        self._websocket_task: Optional[asyncio.Task] = None
        
        logger.debug(f"Initialized LoroTreeModel for document: {doc_id}")

    def initialize_from_lexical_state(self, lexical_state: Union[str, Dict[str, Any]]) -> None:
        """
        Initialize document from Lexical JSON state
        
        Args:
            lexical_state: Lexical state as JSON string or dictionary
            
        Raises:
            ValueError: If lexical_state is invalid
            RuntimeError: If already initialized
        """
        if self._is_initialized:
            raise RuntimeError("Model is already initialized")
        
        try:
            # Import lexical state into tree
            self.root_tree_id = self.converter.import_from_lexical_state(lexical_state)
            
            # Synchronize node mappings
            self.mapper.sync_existing_nodes()
            
            self._is_initialized = True
            self._modification_count += 1
            
            # Emit initialization event
            self._emit_event(TreeEventType.DOCUMENT_CHANGED, {
                "action": "initialized",
                "root_tree_id": self.root_tree_id,
                "node_count": len(list(self.tree.nodes()))
            })
            
            logger.debug(f"🚀 Initialized document {self.doc_id} with root tree ID: {self.root_tree_id}")
            
            # Log initial document structure
            try:
                initial_state = self.export_to_lexical_state(log_structure=True)
                self._log_document_structure(initial_state, "INITIALIZATION")
            except Exception as log_error:
                logger.error(f"Failed to log initial document structure: {log_error}")
            
        except Exception as e:
            logger.error(f"Failed to initialize from lexical state: {e}")
            raise

    def export_to_lexical_state(self, log_structure: bool = False) -> Dict[str, Any]:
        """
        Export current tree state to Lexical JSON format
        
        Args:
            log_structure: Whether to log document structure for debugging
        
        Returns:
            Lexical state as dictionary
            
        Raises:
            RuntimeError: If not initialized
        """
        if not self._is_initialized:
            raise RuntimeError("Model is not initialized")
        
        try:
            lexical_state = self.converter.export_to_lexical_state(self.root_tree_id)
            
            # Add detailed logging for document structure if requested
            if log_structure:
                self._log_document_structure(lexical_state, "EXPORT")
            
            logger.debug(f"Exported document {self.doc_id} to lexical state")
            return lexical_state
        except Exception as e:
            logger.error(f"Failed to export to lexical state: {e}")
            raise

    def save_document_state(self, file_path: str) -> None:
        """
        Save current document state to file as Lexical JSON
        
        Args:
            file_path: Path to save the document
        """
        try:
            lexical_state = self.export_to_lexical_state()
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(lexical_state, f, indent=2, ensure_ascii=False)
            
            self._last_save_time = time.time()
            
            logger.debug(f"Saved document {self.doc_id} to {file_path}")
            
        except Exception as e:
            logger.error(f"Failed to save document state: {e}")
            raise

    def load_document_state(self, file_path: str) -> None:
        """
        Load document state from Lexical JSON file
        
        Args:
            file_path: Path to the document file
            
        Raises:
            FileNotFoundError: If file doesn't exist
            ValueError: If file contains invalid JSON
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                lexical_state = json.load(f)
            
            # Clear existing state and initialize
            self._clear_document()
            self.initialize_from_lexical_state(lexical_state)
            
            logger.debug(f"Loaded document {self.doc_id} from {file_path}")
            
        except FileNotFoundError:
            logger.error(f"Document file not found: {file_path}")
            raise
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in document file: {e}")
            raise ValueError(f"Invalid JSON format: {e}")

    def add_block_to_tree(
        self,
        parent_key: str,
        block_data: Dict[str, Any],
        index: Optional[int] = None
    ) -> str:
        """
        Add new block to tree structure
        
        Args:
            parent_key: Lexical key of parent node
            block_data: Block data dictionary
            index: Position within parent (None for append)
            
        Returns:
            Lexical key of created block
            
        Raises:
            ValueError: If parent not found or block_data invalid
        """
        if not self._is_initialized:
            raise RuntimeError("Model is not initialized")
        
        if "type" not in block_data:
            raise ValueError("Block data must contain 'type' field")
        
        try:
            # Get parent tree node
            parent_tree_node = self.mapper.get_loro_node_by_lexical_key(parent_key)
            if not parent_tree_node:
                raise ValueError(f"Parent node with key {parent_key} not found")
            
            # Generate key for new block
            new_key = self._generate_lexical_key()
            
            # Create tree node
            if index is not None:
                child_tree_node = self.tree.create_at(index, parent_tree_node.id)
            else:
                # Append at end
                existing_children = self.tree.children(parent_tree_node.id)
                child_count = len(existing_children) if existing_children else 0
                child_tree_node = self.tree.create_at(child_count, parent_tree_node.id)
            
            # Store block data
            child_meta = self.tree.get_meta(child_tree_node)
            child_meta.insert("elementType", block_data["type"])
            
            # Clean and store lexical data
            cleaned_data = self._clean_lexical_data(block_data)
            child_meta.insert("lexical", cleaned_data)
            
            # Create mapping
            tree_id = str(child_tree_node)
            self.mapper.create_mapping(new_key, tree_id)
            
            # Process children if they exist
            if "children" in block_data and isinstance(block_data["children"], list):
                for child_index, child_data in enumerate(block_data["children"]):
                    if isinstance(child_data, dict) and "type" in child_data:
                        # Recursively add child nodes
                        self.add_block_to_tree(new_key, child_data, child_index)
            
            self._modification_count += 1
            
            # Emit event
            self._emit_event(TreeEventType.TREE_NODE_CREATED, {
                "lexical_key": new_key,
                "tree_id": tree_id,
                "parent_key": parent_key,
                "block_data": block_data,
                "index": index
            })
            
            logger.debug(f"✏️ Added block to tree: {new_key} (type: {block_data['type']}) to parent: {parent_key}")
            
            # Log document structure after manual addition
            try:
                current_state = self.export_to_lexical_state(log_structure=True)
                self._log_document_structure(current_state, "ADD_BLOCK")
            except Exception as log_error:
                logger.error(f"Failed to log document structure after add_block: {log_error}")
                
            return new_key
            
        except Exception as e:
            logger.error(f"Failed to add block to tree: {e}")
            raise

    def update_tree_node(self, node_key: str, new_data: Dict[str, Any]) -> None:
        """
        Update existing tree node data
        
        Args:
            node_key: Lexical key of node to update
            new_data: New node data
            
        Raises:
            ValueError: If node not found or new_data invalid
        """
        if not self._is_initialized:
            raise RuntimeError("Model is not initialized")
        
        try:
            # Get tree node
            tree_node = self.mapper.get_loro_node_by_lexical_key(node_key)
            if not tree_node:
                raise ValueError(f"Node with key {node_key} not found")
            
            # Update element type if provided
            node_meta = self.tree.get_meta(tree_node.id)
            if "type" in new_data:
                node_meta.insert("elementType", new_data["type"])
            
            # Clean and update lexical data
            cleaned_data = self._clean_lexical_data(new_data)
            node_meta.insert("lexical", cleaned_data)
            
            self._modification_count += 1
            
            # Emit event
            self._emit_event(TreeEventType.TREE_NODE_UPDATED, {
                "lexical_key": node_key,
                "tree_id": str(tree_node),
                "new_data": new_data
            })
            
            logger.debug(f"🔄 Updated tree node: {node_key} (type: {new_data.get('type', 'unknown')})")
            
            # Log document structure after manual update
            try:
                current_state = self.export_to_lexical_state(log_structure=True)
                self._log_document_structure(current_state, "UPDATE_NODE")
            except Exception as log_error:
                logger.error(f"Failed to log document structure after update_node: {log_error}")
            
        except Exception as e:
            logger.error(f"Failed to update tree node: {e}")
            raise

    def remove_tree_node(self, node_key: str) -> None:
        """
        Remove node from tree structure
        
        Args:
            node_key: Lexical key of node to remove
            
        Raises:
            ValueError: If node not found or is root node
        """
        if not self._is_initialized:
            raise RuntimeError("Model is not initialized")
        
        try:
            # Get tree node
            tree_node = self.mapper.get_loro_node_by_lexical_key(node_key)
            if not tree_node:
                raise ValueError(f"Node with key {node_key} not found")
            
            # Prevent deletion of root node
            tree_id = str(tree_node)
            if tree_id == self.root_tree_id:
                raise ValueError("Cannot delete root node")
            
            # Remove mapping first
            self.mapper.remove_mapping(lexical_key=node_key)
            
            # Delete tree node
            tree_node.delete()
            
            self._modification_count += 1
            
            # Emit event
            self._emit_event(TreeEventType.TREE_NODE_DELETED, {
                "lexical_key": node_key,
                "tree_id": tree_id
            })
            
            logger.debug(f"🗑️ Removed tree node: {node_key}")
            
            # Log document structure after manual removal
            try:
                current_state = self.export_to_lexical_state(log_structure=True)
                self._log_document_structure(current_state, "REMOVE_NODE")
            except Exception as log_error:
                logger.error(f"Failed to log document structure after remove_node: {log_error}")
            
        except Exception as e:
            logger.error(f"Failed to remove tree node: {e}")
            raise

    def get_tree_node_data(self, node_key: str) -> Optional[Dict[str, Any]]:
        """
        Get tree node data by lexical key
        
        Args:
            node_key: Lexical key of node
            
        Returns:
            Node data dictionary if found, None otherwise
        """
        try:
            tree_node = self.mapper.get_loro_node_by_lexical_key(node_key)
            if not tree_node:
                return None
            
            node_meta = self.tree.get_meta(tree_node.id)
            element_type_obj = node_meta.get("elementType")
            element_type = element_type_obj.value if element_type_obj else None
            
            lexical_data_obj = node_meta.get("lexical")
            lexical_data = lexical_data_obj.value if lexical_data_obj else {}
            
            # Combine element type with lexical data
            result = {"type": element_type, **lexical_data}
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to get tree node data: {e}")
            return None

    def find_nodes_by_type(self, node_type: str) -> List[str]:
        """
        Find all nodes of specified type
        
        Args:
            node_type: Element type to search for
            
        Returns:
            List of lexical keys for matching nodes
        """
        matching_keys = []
        
        try:
            for tree_node in self.tree.nodes():
                node_meta = self.tree.get_meta(tree_node.id)
                element_type_obj = node_meta.get("elementType")
                element_type = element_type_obj.value if element_type_obj else None
                
                if element_type == node_type:
                    tree_id = str(tree_node)
                    lexical_key = self.mapper.get_lexical_key_by_tree_id(tree_id)
                    if lexical_key:
                        matching_keys.append(lexical_key)
            
            return matching_keys
            
        except Exception as e:
            logger.error(f"Failed to find nodes by type: {e}")
            return []

    def get_root_lexical_key(self) -> Optional[str]:
        """
        Get the Lexical key for the root node
        
        Returns:
            Root node's Lexical key or None if not found
        """
        if not self._is_initialized or not self.root_tree_id:
            return None
        
        try:
            # Get the root node's Lexical key from the mapper
            root_key = self.mapper.get_lexical_key_by_tree_id(self.root_tree_id)
            if root_key:
                logger.debug(f"Found root key: {root_key} for tree ID: {self.root_tree_id}")
                return root_key
            
            # If no mapping exists, it might be because the export hasn't been called yet
            # Export once to establish the mapping, then get the key
            logger.debug(f"No root key mapping found, exporting to establish mapping...")
            lexical_state = self.converter.export_to_lexical_state(self.root_tree_id)
            root_key = lexical_state.get("root", {}).get("__key")
            logger.debug(f"Established root key: {root_key}")
            return root_key
            
        except Exception as e:
            logger.error(f"Failed to get root lexical key: {e}")
            return None

    def get_document_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the document
        
        Returns:
            Dictionary with document statistics
        """
        try:
            tree_stats = self.converter.get_tree_stats()
            mapping_stats = self.mapper.get_mapping_stats()
            
            return {
                "doc_id": self.doc_id,
                "is_initialized": self._is_initialized,
                "root_tree_id": self.root_tree_id,
                "modification_count": self._modification_count,
                "last_save_time": self._last_save_time,
                "collaboration_enabled": self.enable_collaboration,
                "tree_stats": tree_stats,
                "mapping_stats": mapping_stats
            }
            
        except Exception as e:
            logger.error(f"Failed to get document stats: {e}")
            return {"error": str(e)}

    def enable_collaborative_mode(self, ephemeral_store: Optional[EphemeralStore] = None) -> None:
        """
        Enable collaborative editing mode
        
        Args:
            ephemeral_store: Optional ephemeral store for real-time sync
        """
        self.enable_collaboration = True
        self._ephemeral_store = ephemeral_store
        
        logger.debug(f"Enabled collaborative mode for document: {self.doc_id}")

    def disable_collaborative_mode(self) -> None:
        """Disable collaborative editing mode"""
        self.enable_collaboration = False
        self._ephemeral_store = None
        self._subscription_id = None
        
        logger.debug(f"Disabled collaborative mode for document: {self.doc_id}")

    def _clear_document(self) -> None:
        """Clear all document state"""
        # Clear tree nodes
        for tree_node in list(self.tree.nodes()):
            try:
                tree_node.delete()
            except Exception as e:
                logger.warning(f"Failed to delete tree node: {e}")
        
        # Clear mappings
        self.mapper.clear_mappings()
        
        # Reset state
        self.root_tree_id = None
        self._is_initialized = False
        self._modification_count = 0

    def _clean_lexical_data(self, lexical_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Remove key-related fields from lexical data
        
        Args:
            lexical_data: Original lexical data
            
        Returns:
            Cleaned lexical data
        """
        keys_to_remove = {"__key", "key", "lexicalKey", "children"}
        
        cleaned_data = {}
        for key, value in lexical_data.items():
            if key not in keys_to_remove:
                cleaned_data[key] = value
        
        return cleaned_data

    def _generate_lexical_key(self) -> str:
        """
        Generate unique lexical key
        
        Returns:
            Generated lexical key
        """
        import random
        import string
        
        return ''.join(random.choices(string.ascii_letters + string.digits, k=8))

    def _emit_event(self, event_type: TreeEventType, data: Dict[str, Any]) -> None:
        """
        Emit event to registered handler
        
        Args:
            event_type: Type of event
            data: Event data
        """
        if self._event_handler:
            try:
                self._event_handler(event_type, data)
            except Exception as e:
                logger.error(f"Event handler error: {e}")
        
        # Handle broadcast events for collaboration
        if event_type == TreeEventType.BROADCAST_NEEDED and self.enable_collaboration:
            self._handle_broadcast_event(data)

    def _handle_broadcast_event(self, data: Dict[str, Any]) -> None:
        """
        Handle broadcast event for collaborative synchronization
        
        Args:
            data: Event data containing update information
        """
        try:
            if self._ephemeral_store:
                # Export current state for broadcast
                lexical_state = self.export_to_lexical_state()
                
                broadcast_data = {
                    "type": "document-update",
                    "docId": self.doc_id,
                    "snapshot": lexical_state,
                    **data
                }
                
                # Note: Actual broadcast implementation would depend on 
                # WebSocket server integration
                logger.debug(f"Broadcasting update for document: {self.doc_id}")
                
        except Exception as e:
            logger.error(f"Failed to handle broadcast event: {e}")

    # ============================================================================
    # WebSocket Client Methods
    # ============================================================================

    async def connect_to_websocket_server(self, max_retries: int = 5) -> None:
        """Connect to the WebSocket server as a client and request snapshot with retry logic"""
        retry_count = 0
        base_delay = 1.0  # Start with 1 second delay
        
        while retry_count <= max_retries:
            try:
                document_url = f"{self.websocket_url}/{self.doc_id}"
                logger.debug(f"🔌 LoroTreeModel connecting to {document_url} (attempt {retry_count + 1}/{max_retries + 1})")
                
                # Connect with aggressive timeout settings to keep connection alive
                self.websocket = await websockets.connect(
                    document_url,
                    ping_interval=15,      # Send ping every 15 seconds (more frequent)
                    ping_timeout=5,        # Wait 5 seconds for pong response (faster detection)  
                    close_timeout=10,      # Wait 10 seconds for close handshake
                    max_size=2**23,        # 8MB max message size
                    compression=None       # Disable compression for speed
                )
                self.websocket_connected = True
                logger.debug(f"✅ MCP SERVER: *** WEBSOCKET CONNECTION ESTABLISHED *** for doc: {self.doc_id}")
                logger.debug(f"✅ MCP SERVER: Connected to: {document_url}")
                
                # Request initial snapshot
                logger.debug(f"📞 MCP SERVER: *** REQUESTING INITIAL SNAPSHOT *** for doc: {self.doc_id}")
                await self._request_snapshot()
                logger.debug(f"📞 MCP SERVER: Snapshot request sent, waiting for response...")
                
                # Start listening for messages
                logger.debug(f"🎧 MCP SERVER: *** STARTING MESSAGE LISTENER *** for doc: {self.doc_id}")
                self._websocket_task = asyncio.create_task(self._listen_for_websocket_messages())
                logger.debug(f"🎧 MCP SERVER: Message listener task created and started")
                
                # Start keepalive ping to prevent connection timeout
                logger.debug(f"🎧 MCP SERVER: *** STARTING KEEPALIVE PING *** for doc: {self.doc_id}")
                logger.debug(f"🎧 MCP SERVER: About to create keepalive task...")
                self._keepalive_task = asyncio.create_task(self._keepalive_ping())
                logger.debug(f"💓 MCP SERVER: *** KEEPALIVE TASK CREATED *** - task object: {self._keepalive_task}")
                logger.debug(f"💓 MCP SERVER: Keepalive task done: {self._keepalive_task.done()}")
                logger.debug(f"💓 MCP SERVER: Keepalive task cancelled: {self._keepalive_task.cancelled()}")
                
                # Start connection monitor
                logger.debug(f"🔍 MCP SERVER: *** STARTING CONNECTION MONITOR *** for doc: {self.doc_id}")
                logger.debug(f"🔍 MCP SERVER: About to create monitor task...")
                self._monitor_task = asyncio.create_task(self._monitor_connection())
                logger.debug(f"🔍 MCP SERVER: *** MONITOR TASK CREATED *** - task object: {self._monitor_task}")
                logger.debug(f"🔍 MCP SERVER: Monitor task done: {self._monitor_task.done()}")
                logger.debug(f"🔍 MCP SERVER: Monitor task cancelled: {self._monitor_task.cancelled()}")
                
                # Set up local update subscription for automatic propagation
                logger.debug(f"🔔 MCP SERVER: *** SETTING UP LOCAL UPDATE SUBSCRIPTION *** for doc: {self.doc_id}")
                self._setup_local_update_subscription()
                logger.debug(f"🔔 MCP SERVER: Local update subscription configured")
                
                logger.debug(f"🎯 MCP SERVER: *** ALL WEBSOCKET SETUP COMPLETE *** for doc: {self.doc_id}")
                logger.debug(f"🎯 MCP SERVER: Now ready to receive updates from editor and send updates to WebSocket server")
                return  # Success, exit retry loop
                
            except Exception as e:
                retry_count += 1
                self.websocket_connected = False
                
                if retry_count <= max_retries:
                    # Calculate exponential backoff delay
                    delay = base_delay * (2 ** (retry_count - 1))
                    logger.warning(f"❌ Failed to connect to WebSocket server (attempt {retry_count}): {e}")
                    logger.debug(f"🔄 Retrying in {delay:.1f} seconds...")
                    await asyncio.sleep(delay)
                else:
                    logger.error(f"❌ Failed to connect to WebSocket server after {max_retries + 1} attempts: {e}")
                    logger.debug("💡 Make sure the WebSocket server is running on port 3002")
                    break

    async def disconnect_from_websocket_server(self) -> None:
        """Disconnect from the WebSocket server"""
        try:
            logger.debug(f"🧹 MCP SERVER: *** TASK CLEANUP STARTING *** for doc: {self.doc_id}")
            
            if self._websocket_task:
                logger.debug(f"🧹 MCP SERVER: Cancelling websocket task - done: {self._websocket_task.done()}, cancelled: {self._websocket_task.cancelled()}")
                self._websocket_task.cancel()
                self._websocket_task = None
                logger.debug(f"🧹 MCP SERVER: Websocket task cancelled and cleared")
            
            if hasattr(self, '_keepalive_task') and self._keepalive_task:
                logger.debug(f"🧹 MCP SERVER: Cancelling keepalive task - done: {self._keepalive_task.done()}, cancelled: {self._keepalive_task.cancelled()}")
                self._keepalive_task.cancel()
                self._keepalive_task = None
                logger.debug(f"🧹 MCP SERVER: Keepalive task cancelled and cleared")
            
            if hasattr(self, '_monitor_task') and self._monitor_task:
                logger.debug(f"🧹 MCP SERVER: Cancelling monitor task - done: {self._monitor_task.done()}, cancelled: {self._monitor_task.cancelled()}")
                self._monitor_task.cancel()
                self._monitor_task = None
                logger.debug(f"🧹 MCP SERVER: Monitor task cancelled and cleared")
                
            logger.debug(f"🧹 MCP SERVER: *** TASK CLEANUP COMPLETED ***")
            
            if self.websocket:
                await self.websocket.close()
                self.websocket = None
            
            self.websocket_connected = False
            logger.debug(f"🔌 LoroTreeModel disconnected from WebSocket server for doc: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"Error disconnecting from WebSocket server: {e}")

    async def _request_snapshot(self) -> None:
        """Request snapshot from the WebSocket server"""
        if not self.websocket or not self.websocket_connected:
            logger.warning("Cannot request snapshot: not connected to WebSocket server")
            return
        
        try:
            message = {
                "type": "query-snapshot",
                "docId": self.doc_id
            }
            
            await self.websocket.send(json.dumps(message))
            logger.debug(f"📸 MCP SERVER: Requested initial snapshot for document: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"❌ MCP SERVER: Failed to request snapshot for document {self.doc_id}: {e}")

    async def _listen_for_websocket_messages(self) -> None:
        """Listen for messages from the WebSocket server"""
        if not self.websocket:
            logger.warning(f"⚠️ MCP SERVER: Cannot listen for messages - no WebSocket connection for doc: {self.doc_id}")
            return
            
        logger.debug(f"🎧 MCP SERVER: *** STARTING WEBSOCKET MESSAGE LISTENER *** for doc: {self.doc_id}")
        logger.debug(f"🎧 MCP SERVER: WebSocket URL: {self.websocket_url}/{self.doc_id}")
        logger.debug(f"🎧 MCP SERVER: Connection object: {self.websocket}")
        logger.debug(f"🎧 MCP SERVER: Connection state: {self.websocket.state if self.websocket else 'None'}")
        logger.debug(f"🎧 MCP SERVER: Thread ID: {threading.get_ident()}")
        logger.debug(f"🎧 MCP SERVER: Async loop: {asyncio.current_task()}")
        
        try:
            logger.debug(f"🎧 MCP SERVER: *** ENTERING WEBSOCKET LISTEN LOOP *** for doc: {self.doc_id}")
            logger.debug(f"🎧 MCP SERVER: About to start async for loop on websocket messages...")
            logger.debug(f"🎧 MCP SERVER: Loop entry timestamp: {time.time()}")
            
            message_count = 0
            heartbeat_count = 0
            last_heartbeat = time.time()
            
            # Add a heartbeat to verify the loop is actually running
            logger.debug(f"💗 MCP SERVER: *** MESSAGE LISTENER HEARTBEAT #{heartbeat_count} *** - Waiting for messages...")
            
            async for message in self.websocket:
                # Log heartbeat every 5 seconds to confirm listener is alive
                current_time = time.time()
                if current_time - last_heartbeat > 5:
                    heartbeat_count += 1
                    logger.debug(f"💗 MCP SERVER: *** LISTENER HEARTBEAT #{heartbeat_count} *** - Still listening for doc: {self.doc_id}")
                    last_heartbeat = current_time
                message_count += 1
                logger.debug(f"🚨 MCP SERVER: *** WEBSOCKET MESSAGE #{message_count} RECEIVED *** for doc: {self.doc_id}")
                logger.debug(f"🚨 MCP SERVER: Timestamp: {time.time()}")
                logger.debug(f"🚨 MCP SERVER: Raw message type: {type(message)}")
                logger.debug(f"🚨 MCP SERVER: Raw message length: {len(message) if hasattr(message, '__len__') else 'unknown'}")
                if isinstance(message, str):
                    logger.debug(f"🚨 MCP SERVER: String message preview: {message[:100]}{'...' if len(message) > 100 else ''}")
                elif isinstance(message, bytes):
                    logger.debug(f"🚨 MCP SERVER: Binary message preview: {message[:50]}{'...' if len(message) > 50 else ''}")
                logger.debug(f"🔔 MCP SERVER: *** NEW WEBSOCKET MESSAGE RECEIVED *** for doc: {self.doc_id}")
                logger.debug(f"🔔 MCP SERVER: Connection status check - websocket_connected: {self.websocket_connected}")
                logger.debug(f"🔔 MCP SERVER: WebSocket object status: {self.websocket is not None}")
                logger.debug(f"🔔 MCP SERVER: Message type: {type(message)}, length: {len(message) if hasattr(message, '__len__') else 'unknown'}")
                
                try:
                    # Handle both binary and text messages
                    if isinstance(message, bytes):
                        # This is binary Loro snapshot data
                        logger.debug(f"📥 MCP SERVER: ===== PROCESSING BINARY MESSAGE =====")
                        logger.debug(f"📥 MCP SERVER: Received BINARY message: {len(message)} bytes for doc: {self.doc_id}")
                        logger.debug(f"📥 MCP SERVER: Binary data preview: {message[:50]}{'...' if len(message) > 50 else ''}")
                        await self._handle_binary_snapshot(message)
                        logger.debug(f"✅ MCP SERVER: ===== BINARY MESSAGE PROCESSED =====")
                    else:
                        # This is JSON text message
                        logger.debug(f"📥 MCP SERVER: ===== PROCESSING TEXT MESSAGE =====")
                        logger.debug(f"📥 MCP SERVER: Received TEXT message for doc: {self.doc_id}: {message[:200]}{'...' if len(message) > 200 else ''}")
                        data = json.loads(message)
                        logger.debug(f"📥 MCP SERVER: Parsed JSON data - type: {data.get('type', 'unknown')}")
                        await self._handle_websocket_message(data)
                        logger.debug(f"✅ MCP SERVER: ===== TEXT MESSAGE PROCESSED =====")
                except json.JSONDecodeError as e:
                    logger.error(f"❌ MCP SERVER: Failed to parse WebSocket JSON message for doc {self.doc_id}: {e}")
                    logger.error(f"❌ MCP SERVER: Raw message: {message}")
                except Exception as e:
                    logger.error(f"❌ MCP SERVER: Error handling WebSocket message for doc {self.doc_id}: {e}")
                    logger.error(f"❌ MCP SERVER: Message type: {type(message)}, content: {message}")
                    import traceback
                    logger.error(f"❌ MCP SERVER: Full traceback: {traceback.format_exc()}")
                
                logger.debug(f"🔔 MCP SERVER: *** MESSAGE #{message_count} HANDLING COMPLETE *** for doc: {self.doc_id}")
                logger.debug(f"🔔 MCP SERVER: Connection still active: {self.websocket_connected}")
                logger.debug(f"🔔 MCP SERVER: Waiting for next message... (processed {message_count} so far)")
                    
        except websockets.exceptions.ConnectionClosed as e:
            logger.error(f"💔 MCP SERVER: *** WEBSOCKET CONNECTION CLOSED *** for doc: {self.doc_id}")
            logger.error(f"💔 MCP SERVER: Connection closed exception: {e}")
            logger.error(f"💔 MCP SERVER: Connection was closed by server or network issue")
            logger.error(f"💔 MCP SERVER: Total messages processed before close: {message_count}")
            self.websocket_connected = False
            self.websocket = None
            # Try to reconnect automatically
            logger.debug(f"🔄 MCP SERVER: Attempting automatic reconnection...")
            await self._reconnect_websocket()
        except Exception as e:
            logger.error(f"❌ MCP SERVER: *** WEBSOCKET LISTENER ERROR *** for doc: {self.doc_id}: {e}")
            logger.error(f"❌ MCP SERVER: Total messages processed before error: {message_count}")
            import traceback
            logger.error(f"❌ MCP SERVER: Full error traceback: {traceback.format_exc()}")
            self.websocket_connected = False
            self.websocket = None
            # Try to reconnect automatically
            logger.debug(f"🔄 MCP SERVER: Attempting reconnection after error...")
            await self._reconnect_websocket()
            
        logger.debug(f"🏁 MCP SERVER: *** WEBSOCKET LISTEN LOOP EXITED *** for doc: {self.doc_id}")
        logger.debug(f"🏁 MCP SERVER: Total messages processed: {message_count}")
        logger.debug(f"🏁 MCP SERVER: Final connection status: {self.websocket_connected}")
        logger.debug(f"🏁 MCP SERVER: Loop exit timestamp: {time.time()}")

    async def _keepalive_ping(self) -> None:
        """Send periodic ping to keep WebSocket connection alive"""
        try:
            logger.debug(f"💓 MCP SERVER: *** KEEPALIVE TASK STARTED *** for doc: {self.doc_id}")
            logger.debug(f"💓 MCP SERVER: Will ping every 5 seconds")
            logger.debug(f"💓 MCP SERVER: Initial connection state: {self.websocket_connected}")
            logger.debug(f"💓 MCP SERVER: Initial WebSocket object: {self.websocket is not None}")
            
            ping_counter = 0
            while self.websocket_connected and self.websocket:
                try:
                    logger.debug(f"💓 MCP SERVER: *** KEEPALIVE SLEEP START #{ping_counter + 1} *** - waiting 5 seconds...")
                    await asyncio.sleep(5)  # Ping every 5 seconds (even more frequent)
                    ping_counter += 1
                    
                    logger.debug(f"💓 MCP SERVER: *** KEEPALIVE SLEEP END #{ping_counter} *** - checking connection...")
                    logger.debug(f"💓 MCP SERVER: websocket_connected: {self.websocket_connected}")
                    logger.debug(f"💓 MCP SERVER: websocket object exists: {self.websocket is not None}")
                    
                    if self.websocket and self.websocket_connected:
                        logger.debug(f"💓 MCP SERVER: *** SENDING KEEPALIVE PING #{ping_counter} *** for doc: {self.doc_id}")
                        logger.debug(f"💓 MCP SERVER: WebSocket state: {self.websocket.state if hasattr(self.websocket, 'state') else 'unknown'}")
                        logger.debug(f"💓 MCP SERVER: Connection status: {self.websocket_connected}")
                        logger.debug(f"💓 MCP SERVER: Timestamp: {time.time()}")
                        
                        # Try both ping() method and keepalive message
                        try:
                            # First try the WebSocket ping() method with short timeout
                            logger.debug(f"💓 MCP SERVER: *** ATTEMPTING WEBSOCKET PING #{ping_counter} *** for doc: {self.doc_id}")
                            logger.debug(f"💓 MCP SERVER: Ping timestamp: {time.time()}")
                            logger.debug(f"💓 MCP SERVER: WebSocket object: {self.websocket}")
                            logger.debug(f"💓 MCP SERVER: WebSocket closed status: {getattr(self.websocket, 'closed', 'unknown')}")
                            
                            pong_waiter = await self.websocket.ping()
                            logger.debug(f"✅ MCP SERVER: *** WEBSOCKET PING SENT #{ping_counter} *** - awaiting pong response...")
                            logger.debug(f"✅ MCP SERVER: Pong waiter object: {pong_waiter}")
                            
                            await asyncio.wait_for(pong_waiter, timeout=2.0)
                            logger.debug(f"🎉 MCP SERVER: *** WEBSOCKET PING-PONG SUCCESS #{ping_counter} *** for doc: {self.doc_id}")
                            logger.debug(f"🎉 MCP SERVER: Round-trip successful at timestamp: {time.time()}")
                            
                        except asyncio.TimeoutError:
                            logger.error(f"⚠️ MCP SERVER: *** PING TIMEOUT #{ping_counter} *** after 2s for doc: {self.doc_id}")
                            logger.error(f"⚠️ MCP SERVER: WebSocket may be unresponsive, trying keepalive message...")
                            
                            # Fallback to keepalive message
                            keepalive_msg = {
                                "type": "keepalive",
                                "doc_id": self.doc_id,
                                "timestamp": time.time(),
                                "ping_id": ping_counter,
                                "reason": "ping_timeout_fallback"
                            }
                            logger.debug(f"📤 MCP SERVER: *** SENDING KEEPALIVE MESSAGE #{ping_counter} *** for doc: {self.doc_id}")
                            logger.debug(f"📤 MCP SERVER: Keepalive message: {keepalive_msg}")
                            
                            await self.websocket.send(json.dumps(keepalive_msg))
                            logger.debug(f"✅ MCP SERVER: *** KEEPALIVE MESSAGE SENT #{ping_counter} *** for doc: {self.doc_id}")
                            
                        except Exception as ping_error:
                            logger.error(f"❌ MCP SERVER: *** PING FAILED #{ping_counter} *** for doc: {self.doc_id}: {ping_error}")
                            logger.error(f"❌ MCP SERVER: Ping error type: {type(ping_error)}")
                            logger.error(f"❌ MCP SERVER: Trying keepalive message as fallback...")
                            
                            # Fallback to keepalive message
                            keepalive_msg = {
                                "type": "keepalive", 
                                "doc_id": self.doc_id,
                                "timestamp": time.time(),
                                "ping_id": ping_counter,
                                "reason": "ping_error_fallback",
                                "error": str(ping_error)
                            }
                            logger.debug(f"📤 MCP SERVER: *** SENDING KEEPALIVE MESSAGE #{ping_counter} *** for doc: {self.doc_id}")
                            logger.debug(f"📤 MCP SERVER: Keepalive message: {keepalive_msg}")
                            
                            try:
                                await self.websocket.send(json.dumps(keepalive_msg))
                                logger.debug(f"✅ MCP SERVER: *** KEEPALIVE MESSAGE SENT #{ping_counter} *** for doc: {self.doc_id}")
                            except Exception as send_error:
                                logger.error(f"💥 MCP SERVER: *** KEEPALIVE SEND FAILED #{ping_counter} *** for doc: {self.doc_id}: {send_error}")
                                logger.error(f"💥 MCP SERVER: Connection appears to be broken, will exit keepalive loop")
                                self.websocket_connected = False
                                break
                            
                    else:
                        logger.warning(f"💔 MCP SERVER: *** WEBSOCKET DISCONNECTED *** - stopping keepalive for doc: {self.doc_id}")
                        logger.warning(f"💔 MCP SERVER: websocket: {self.websocket is not None}")
                        logger.warning(f"💔 MCP SERVER: websocket_connected: {self.websocket_connected}")
                        break
                        
                except Exception as e:
                    logger.error(f"💔 MCP SERVER: Keepalive ping #{ping_counter} failed for doc {self.doc_id}: {e}")
                    logger.error(f"💔 MCP SERVER: Connection likely closed, stopping keepalive")
                    break
                    
            logger.debug(f"💔 MCP SERVER: Keepalive ping stopped for doc: {self.doc_id} after {ping_counter} pings")
            
        except asyncio.CancelledError:
            logger.debug(f"💤 MCP SERVER: *** KEEPALIVE TASK CANCELLED *** for doc: {self.doc_id}")
            raise  # Re-raise cancellation
        except Exception as e:
            logger.error(f"💥 MCP SERVER: *** KEEPALIVE TASK CRASHED *** for doc: {self.doc_id}: {e}")
            logger.error(f"💥 MCP SERVER: Exception type: {type(e)}")
            import traceback
            logger.error(f"💥 MCP SERVER: Full traceback:\n{traceback.format_exc()}")

    async def _monitor_connection(self) -> None:
        """Monitor WebSocket connection state and attempt reconnection if needed"""
        try:
            logger.debug(f"🔍 MCP SERVER: *** CONNECTION MONITOR STARTED *** for doc: {self.doc_id}")
            logger.debug(f"🔍 MCP SERVER: Will check connection every 3 seconds")
            logger.debug(f"🔍 MCP SERVER: Initial monitor state - connected: {self.websocket_connected}, websocket: {self.websocket is not None}")
            
            monitor_counter = 0
            while self.websocket_connected and self.websocket:
                try:
                    logger.debug(f"🔍 MCP SERVER: *** MONITOR SLEEP START #{monitor_counter + 1} *** - waiting 3 seconds...")
                    await asyncio.sleep(3)  # Check every 3 seconds
                    monitor_counter += 1
                    
                    logger.debug(f"🔍 MCP SERVER: *** MONITOR SLEEP END #{monitor_counter} *** - checking connection state...")
                    
                    if self.websocket:
                        connection_state = getattr(self.websocket, 'state', 'unknown')
                        logger.debug(f"🔍 MCP SERVER: *** CONNECTION CHECK #{monitor_counter} *** for doc: {self.doc_id}")
                        logger.debug(f"🔍 MCP SERVER: WebSocket state: {connection_state}")
                        logger.debug(f"🔍 MCP SERVER: websocket_connected: {self.websocket_connected}")
                        
                        # Check if connection is closed or closing
                        if hasattr(self.websocket, 'closed') and self.websocket.closed:
                            logger.error(f"💔 MCP SERVER: *** CONNECTION DETECTED AS CLOSED *** #{monitor_counter}")
                            logger.error(f"💔 MCP SERVER: Will attempt reconnection...")
                            self.websocket_connected = False
                            break
                        elif str(connection_state) in ['CLOSED', 'CLOSING']:
                            logger.error(f"💔 MCP SERVER: *** CONNECTION CLOSING/CLOSED *** #{monitor_counter} - state: {connection_state}")
                            logger.error(f"💔 MCP SERVER: Will attempt reconnection...")
                            self.websocket_connected = False
                            break
                        else:
                            logger.debug(f"✅ MCP SERVER: Connection healthy #{monitor_counter} - state: {connection_state}")
                            
                except Exception as e:
                    logger.error(f"💔 MCP SERVER: Connection monitor error #{monitor_counter}: {e}")
                    logger.error(f"💔 MCP SERVER: Assuming connection failed, will reconnect")
                    self.websocket_connected = False
                    break
                
            logger.debug(f"🔍 MCP SERVER: Connection monitor stopped for doc: {self.doc_id} after {monitor_counter} checks")
            
            # Attempt reconnection if we detected a problem
            if not self.websocket_connected:
                logger.debug(f"🔄 MCP SERVER: *** TRIGGERING RECONNECTION *** for doc: {self.doc_id}")
                await self._reconnect_websocket()
                
        except asyncio.CancelledError:
            logger.debug(f"💤 MCP SERVER: *** CONNECTION MONITOR CANCELLED *** for doc: {self.doc_id}")
            raise  # Re-raise cancellation
        except Exception as e:
            logger.error(f"💥 MCP SERVER: *** CONNECTION MONITOR CRASHED *** for doc: {self.doc_id}: {e}")
            logger.error(f"💥 MCP SERVER: Exception type: {type(e)}")
            import traceback
            logger.error(f"💥 MCP SERVER: Full traceback:\n{traceback.format_exc()}")

    async def _reconnect_websocket(self) -> None:
        """Attempt to reconnect to WebSocket server"""
        logger.debug(f"🔄 Attempting to reconnect WebSocket for doc: {self.doc_id}")
        await asyncio.sleep(2)  # Wait before reconnecting
        try:
            await self.connect_to_websocket_server(max_retries=3)
        except Exception as e:
            logger.error(f"Failed to reconnect WebSocket: {e}")

    async def _handle_binary_snapshot(self, binary_data: bytes) -> None:
        """Handle binary snapshot data directly from WebSocket server"""
        try:
            logger.debug(f"� MCP SERVER: ==== PROCESSING BINARY SNAPSHOT ====")
            logger.debug(f"📸 MCP SERVER: Binary snapshot size: {len(binary_data)} bytes for document: {self.doc_id}")
            logger.debug(f"📸 MCP SERVER: Document state BEFORE import - initialized: {self._is_initialized}")
            
            # Log current document state before import
            try:
                pre_state = self.export_to_lexical_state()
                pre_children = len(pre_state.get('root', {}).get('children', []))
                logger.debug(f"📸 MCP SERVER: Pre-import document has {pre_children} children")
            except Exception as e:
                logger.debug(f"📸 MCP SERVER: Could not get pre-import state: {e}")
            
            # Import binary snapshot directly into Loro document
            logger.debug(f"📸 MCP SERVER: Importing binary data into Loro document...")
            self.doc.import_(binary_data)
            logger.debug(f"✅ MCP SERVER: Successfully imported binary snapshot into Loro document: {self.doc_id}")
            
            # Update tree reference and synchronize mappings
            logger.debug(f"🔄 MCP SERVER: Updating tree reference and syncing node mappings...")
            self.tree = self.doc.get_tree(self.tree_name)
            
            # Check if tree has nodes after import
            try:
                all_nodes = list(self.tree.nodes())
                logger.debug(f"🔍 MCP SERVER: Tree now has {len(all_nodes)} nodes after binary import")
                
                if all_nodes:
                    self.mapper.sync_existing_nodes()
                    logger.debug(f"✅ MCP SERVER: Tree reference updated and mappings synced")
                else:
                    logger.warning(f"⚠️ MCP SERVER: Tree appears empty after binary import - this may be expected for new documents")
                    
            except Exception as tree_check_error:
                logger.error(f"❌ MCP SERVER: Error checking tree nodes: {tree_check_error}")
            
            # Mark as initialized if we got valid content
            if not self._is_initialized:
                self._is_initialized = True
                logger.debug(f"🎯 MCP SERVER: Document {self.doc_id} NOW INITIALIZED from binary WebSocket snapshot!")
            else:
                logger.debug(f"🔄 MCP SERVER: Document {self.doc_id} was already initialized, updated with new snapshot")
            
            # Log document structure after applying snapshot (with better error handling)
            try:
                # Give a small delay to ensure tree is fully synchronized
                await asyncio.sleep(0.1)
                
                current_state = self.export_to_lexical_state(log_structure=True)
                self._log_document_structure(current_state, "BINARY_SNAPSHOT")
                root_children = current_state.get('root', {}).get('children', [])
                logger.debug(f"📊 MCP SERVER: AFTER SNAPSHOT - Document {self.doc_id} now has {len(root_children)} root children")
                
                # Log the actual content received
                for i, child in enumerate(root_children):
                    child_type = child.get('type', 'unknown')
                    child_key = child.get('__key', 'no-key')
                    
                    if child_type == 'heading':
                        text_content = self._extract_text_from_node(child)
                        logger.debug(f"📊 MCP SERVER: Child[{i}]: {child_type} (key: {child_key}) - '{text_content}'")
                    elif child_type == 'paragraph':
                        text_content = self._extract_text_from_node(child)
                        logger.debug(f"📊 MCP SERVER: Child[{i}]: {child_type} (key: {child_key}) - '{text_content}'")
                    else:
                        logger.debug(f"📊 MCP SERVER: Child[{i}]: {child_type} (key: {child_key})")
                        
            except Exception as log_error:
                logger.error(f"❌ MCP SERVER: Failed to log document structure after binary snapshot: {log_error}")
                # Try alternative approach to check document content
                try:
                    all_nodes = list(self.tree.nodes())  # Returns TreeID objects
                    logger.debug(f"🔍 MCP SERVER: Tree inspection - total nodes: {len(all_nodes)}")
                    if all_nodes:
                        logger.debug(f"🔍 MCP SERVER: First few nodes: {[str(node) for node in all_nodes[:5]]}")
                    else:
                        logger.debug(f"🔍 MCP SERVER: Tree is indeed empty - might be a timing issue or empty document")
                except Exception as inspect_error:
                    logger.error(f"❌ MCP SERVER: Could not inspect tree: {inspect_error}")
            
            logger.debug(f"✅ MCP SERVER: ==== BINARY SNAPSHOT PROCESSING COMPLETE ====")
                
        except Exception as e:
            logger.error(f"❌ MCP SERVER: Failed to handle binary snapshot for {self.doc_id}: {e}")
            import traceback
            logger.error(f"❌ MCP SERVER: Traceback: {traceback.format_exc()}")

    def _extract_text_from_node(self, node: Dict[str, Any]) -> str:
        """Extract text content from a node and its children"""
        text_parts = []
        
        if node.get('type') == 'text' and 'text' in node:
            text_parts.append(node['text'])
        
        if 'children' in node:
            for child in node['children']:
                text_parts.append(self._extract_text_from_node(child))
        
        return ''.join(text_parts)

    async def _handle_websocket_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming WebSocket JSON message"""
        message_type = data.get("type", "")
        logger.debug(f"📨 MCP SERVER: Processing JSON message type '{message_type}' for doc: {self.doc_id}")
        
        if message_type == "update":
            logger.debug(f"🔄 MCP SERVER: Handling UPDATE message for doc: {self.doc_id}")
            await self._handle_update_message(data)
        elif message_type == "snapshot":
            logger.debug(f"📸 MCP SERVER: Handling JSON SNAPSHOT message for doc: {self.doc_id}")
            await self._handle_snapshot_message(data)
        elif message_type == "keepalive_ack":
            await self._handle_keepalive_ack(data)
        else:
            logger.debug(f"❓ MCP SERVER: Received unknown WebSocket message type '{message_type}' for doc: {self.doc_id} with data: {data}")

    async def _handle_snapshot_message(self, data: Dict[str, Any]) -> None:
        """Handle snapshot message from WebSocket server"""
        try:
            snapshot_data = data.get("snapshot")
            if snapshot_data:
                logger.debug(f"📸 MCP SERVER: Receiving initial snapshot from WebSocket server for document: {self.doc_id}")
                
                # Import snapshot into Loro document
                self.doc.import_(bytes(snapshot_data))
                logger.debug(f"✅ MCP SERVER: Applied initial snapshot for document: {self.doc_id}")
                
                # Update tree reference and synchronize mappings
                self.tree = self.doc.get_tree(self.tree_name)
                self.mapper.sync_existing_nodes()
                
                # Mark as initialized if we got valid content
                if not self._is_initialized:
                    self._is_initialized = True
                    logger.debug(f"🎯 MCP SERVER: Document {self.doc_id} initialized from WebSocket snapshot - ready for real-time collaboration!")
                
                # Log initial document structure
                try:
                    current_state = self.export_to_lexical_state(log_structure=True)
                    self._log_document_structure(current_state, "INITIAL_SNAPSHOT")
                    logger.debug(f"📊 MCP SERVER: Initial document {self.doc_id} has {len(current_state.get('root', {}).get('children', []))} root children")
                except Exception as log_error:
                    logger.error(f"Failed to log initial document structure: {log_error}")
                    
        except Exception as e:
            logger.error(f"Failed to handle snapshot message: {e}")

    async def _handle_update_message(self, data: Dict[str, Any]) -> None:
        """Handle update message from WebSocket server"""
        try:
            logger.debug(f"🔄 MCP SERVER: ===== PROCESSING UPDATE MESSAGE =====")
            logger.debug(f"🔄 MCP SERVER: Message data keys: {list(data.keys())}")
            
            update_data = data.get("update")
            if update_data:
                logger.debug(f"🔄 MCP SERVER: *** UPDATE DATA FOUND ***")
                logger.debug(f"🔄 MCP SERVER: Update data type: {type(update_data)}")
                logger.debug(f"🔄 MCP SERVER: Update data length: {len(update_data) if hasattr(update_data, '__len__') else 'unknown'}")
                logger.debug(f"🔄 MCP SERVER: Receiving real-time update from editor for document: {self.doc_id}")
                
                # Log document state BEFORE applying update
                try:
                    before_state = self.export_to_lexical_state()
                    before_children_count = len(before_state.get('root', {}).get('children', []))
                    logger.debug(f"📊 MCP SERVER: BEFORE UPDATE - Document {self.doc_id} has {before_children_count} root children")
                except Exception as before_log_error:
                    logger.error(f"Failed to log document state before update: {before_log_error}")
                
                # Apply update to Loro document
                logger.debug(f"🔄 MCP SERVER: Applying update to Loro document...")
                self.doc.import_(bytes(update_data))
                logger.debug(f"✅ MCP SERVER: Successfully imported update bytes into Loro document")
                
                # Refresh tree reference
                logger.debug(f"🔄 MCP SERVER: Refreshing tree reference...")
                self.tree = self.doc.get_tree(self.tree_name)
                logger.debug(f"✅ MCP SERVER: Tree reference refreshed")
                
                # Log document state AFTER applying update
                try:
                    after_state = self.export_to_lexical_state(log_structure=True)
                    after_children_count = len(after_state.get('root', {}).get('children', []))
                    logger.debug(f"📊 MCP SERVER: AFTER UPDATE - Document {self.doc_id} now has {after_children_count} root children")
                    
                    if after_children_count != before_children_count:
                        logger.debug(f"🎯 MCP SERVER: *** DOCUMENT CONTENT CHANGED *** from {before_children_count} to {after_children_count} children")
                    else:
                        logger.debug(f"📝 MCP SERVER: Document structure unchanged, but content may have been modified within existing nodes")
                    
                    self._log_document_structure(after_state, "WEBSOCKET_UPDATE")
                except Exception as log_error:
                    logger.error(f"Failed to log document structure after WebSocket update: {log_error}")
                
                logger.debug(f"✅ MCP SERVER: ===== UPDATE MESSAGE PROCESSED SUCCESSFULLY =====")
            else:
                logger.warning(f"⚠️ MCP SERVER: No 'update' data found in message")
                logger.warning(f"⚠️ MCP SERVER: Available keys: {list(data.keys())}")
                
        except Exception as e:
            logger.error(f"❌ MCP SERVER: Failed to handle update message: {e}")
            import traceback
            logger.error(f"❌ MCP SERVER: Update handling traceback: {traceback.format_exc()}")

    async def send_update_to_websocket_server(self, update_bytes: bytes) -> None:
        """Send update to WebSocket server"""
        if not self.websocket or not self.websocket_connected:
            logger.warning("Cannot send update: not connected to WebSocket server")
            return
            
        try:
            message = {
                "type": "update",
                "docId": self.doc_id,
                "update": list(update_bytes)
            }
            
            await self.websocket.send(json.dumps(message))
            logger.debug(f"📤 Sent update to WebSocket server for doc: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"Failed to send update to WebSocket server: {e}")

    async def _handle_keepalive_ack(self, data: Dict[str, Any]) -> None:
        """Handle keepalive acknowledgment from WebSocket server"""
        try:
            ping_id = data.get("ping_id", "unknown")
            server_timestamp = data.get("server_timestamp", "unknown")
            acknowledged = data.get("acknowledged", False)
            
            logger.debug(f"💓 MCP SERVER: *** RECEIVED KEEPALIVE ACK #{ping_id} *** for doc: {self.doc_id}")
            logger.debug(f"💓 MCP SERVER: Server timestamp: {server_timestamp}")
            logger.debug(f"💓 MCP SERVER: Acknowledged: {acknowledged}")
            logger.debug(f"💓 MCP SERVER: Client timestamp: {time.time()}")
            
            if server_timestamp != "unknown":
                try:
                    roundtrip_time = time.time() - float(server_timestamp)
                    logger.debug(f"💓 MCP SERVER: *** KEEPALIVE ROUND-TRIP TIME: {roundtrip_time:.3f}s ***")
                except (ValueError, TypeError):
                    logger.warning(f"💓 MCP SERVER: Could not calculate round-trip time from server timestamp: {server_timestamp}")
            
            if acknowledged:
                logger.debug(f"✅ MCP SERVER: *** KEEPALIVE #{ping_id} ACKNOWLEDGED *** - connection is healthy")
            else:
                logger.warning(f"⚠️ MCP SERVER: *** KEEPALIVE #{ping_id} NOT ACKNOWLEDGED *** - potential issue")
            
        except Exception as e:
            logger.error(f"💔 MCP SERVER: Error handling keepalive ACK: {e}")
            logger.error(f"💔 MCP SERVER: ACK data: {data}")

    def _setup_local_update_subscription(self) -> None:
        """Set up subscription to automatically propagate local document changes to WebSocket server"""
        try:
            if hasattr(self, '_local_update_subscription'):
                logger.debug(f"Local update subscription already exists for doc: {self.doc_id}")
                return
                
            def local_update_callback(update_bytes):
                """Callback to handle local document changes and send to WebSocket"""
                try:
                    logger.debug(f"🔄 LOCAL UPDATE: Document {self.doc_id} changed locally, propagating {len(update_bytes)} bytes to WebSocket")
                    
                    if self.websocket_connected and self.websocket:
                        # Schedule the async send operation
                        asyncio.create_task(self._send_local_update_to_websocket(update_bytes))
                    else:
                        logger.warning(f"⚠️ LOCAL UPDATE: WebSocket not connected for doc {self.doc_id}, cannot propagate local changes")
                    
                    return True  # Continue subscription
                except Exception as e:
                    logger.error(f"❌ LOCAL UPDATE: Failed to handle local update for doc {self.doc_id}: {e}")
                    return True  # Continue subscription even on error
            
            # Subscribe to local document updates
            self._local_update_subscription = self.doc.subscribe_local_update(local_update_callback)
            logger.debug(f"✅ LOCAL UPDATE: Subscription established for doc: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"❌ LOCAL UPDATE: Failed to set up subscription for doc {self.doc_id}: {e}")

    async def _send_local_update_to_websocket(self, update_bytes: bytes) -> None:
        """Send local update to WebSocket server (async helper for subscription callback)"""
        try:
            if not self.websocket_connected or not self.websocket:
                logger.warning(f"Cannot send local update: WebSocket not connected for doc {self.doc_id}")
                return
                
            message = {
                "type": "update",
                "docId": self.doc_id,
                "update": list(update_bytes)
            }
            
            await self.websocket.send(json.dumps(message))
            logger.debug(f"✅ LOCAL UPDATE: Successfully propagated {len(update_bytes)} bytes to WebSocket server for doc: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"❌ LOCAL UPDATE: Failed to send to WebSocket server for doc {self.doc_id}: {e}")

    def _log_document_structure(self, lexical_state: Dict[str, Any], operation: str) -> None:
        """
        Log detailed document structure for debugging
        
        Args:
            lexical_state: The lexical JSON state
            operation: The operation that triggered this logging (e.g., 'EXPORT', 'WEBSOCKET_UPDATE')
        """
        try:
            if not lexical_state or 'root' not in lexical_state:
                logger.warning(f"📋 [{operation}] Document {self.doc_id}: NO ROOT FOUND in lexical state")
                return
                
            root = lexical_state['root']
            children = root.get('children', [])
            child_count = len(children)
            
            logger.debug(f"📋 [{operation}] Document {self.doc_id} structure:")
            logger.debug(f"  └─ Root type: {root.get('type', 'unknown')}")
            logger.debug(f"  └─ Root key: {root.get('__key', 'no-key')}")
            logger.debug(f"  └─ Children count: {child_count}")
            
            # Log details of each child
            for i, child in enumerate(children):
                child_type = child.get('type', 'unknown')
                child_key = child.get('__key', 'no-key')
                child_children = child.get('children', [])
                child_text = ""
                
                # Extract text content if available
                if child_type == 'paragraph' and child_children:
                    text_nodes = [c for c in child_children if c.get('type') == 'text']
                    if text_nodes:
                        child_text = f" (text: '{text_nodes[0].get('text', '')}')"
                
                logger.debug(f"    └─ Child[{i}]: {child_type} (key: {child_key}, children: {len(child_children)}){child_text}")
                
                # Log grandchildren for debugging
                for j, grandchild in enumerate(child_children[:3]):  # Limit to first 3 for brevity
                    gc_type = grandchild.get('type', 'unknown')
                    gc_key = grandchild.get('__key', 'no-key')
                    gc_text = grandchild.get('text', '') if gc_type == 'text' else ''
                    gc_text_preview = f" '{gc_text[:50]}{'...' if len(gc_text) > 50 else ''}'" if gc_text else ''
                    logger.debug(f"      └─ GrandChild[{j}]: {gc_type} (key: {gc_key}){gc_text_preview}")
                    
        except Exception as e:
            logger.error(f"Failed to log document structure: {e}")