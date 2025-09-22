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
from typing import Dict, Any, List, Optional, Callable, Union
from enum import Enum
import websockets
import loro
from loro import LoroDoc, LoroTree, ExportMode, EphemeralStore

from .lexical_tree_converter import LexicalTreeConverter
from .tree_node_mapper import TreeNodeMapper

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
        tree_name: str = "lexical",
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
        self.doc.set_peer_id(doc_id)
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
        
        logger.info(f"Initialized LoroTreeModel for document: {doc_id}")

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
            
            logger.info(f"Initialized document {self.doc_id} with root tree ID: {self.root_tree_id}")
            
        except Exception as e:
            logger.error(f"Failed to initialize from lexical state: {e}")
            raise

    def export_to_lexical_state(self) -> Dict[str, Any]:
        """
        Export current tree state to Lexical JSON format
        
        Returns:
            Lexical state as dictionary
            
        Raises:
            RuntimeError: If not initialized
        """
        if not self._is_initialized:
            raise RuntimeError("Model is not initialized")
        
        try:
            lexical_state = self.converter.export_to_lexical_state(self.root_tree_id)
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
            
            logger.info(f"Saved document {self.doc_id} to {file_path}")
            
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
            
            logger.info(f"Loaded document {self.doc_id} from {file_path}")
            
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
                child_tree_node = self.tree.create(parent_tree_node.id(), index)
            else:
                # Append at end
                child_count = len(list(parent_tree_node.children()))
                child_tree_node = self.tree.create(parent_tree_node.id(), child_count)
            
            # Store block data
            child_tree_node.data().set("elementType", block_data["type"])
            
            # Clean and store lexical data
            cleaned_data = self._clean_lexical_data(block_data)
            child_tree_node.data().set("lexical", cleaned_data)
            
            # Create mapping
            tree_id = str(child_tree_node.id())
            self.mapper.create_mapping(new_key, tree_id)
            
            self._modification_count += 1
            
            # Emit event
            self._emit_event(TreeEventType.TREE_NODE_CREATED, {
                "lexical_key": new_key,
                "tree_id": tree_id,
                "parent_key": parent_key,
                "block_data": block_data,
                "index": index
            })
            
            logger.debug(f"Added block to tree: {new_key} (type: {block_data['type']})")
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
            if "type" in new_data:
                tree_node.data().set("elementType", new_data["type"])
            
            # Clean and update lexical data
            cleaned_data = self._clean_lexical_data(new_data)
            tree_node.data().set("lexical", cleaned_data)
            
            self._modification_count += 1
            
            # Emit event
            self._emit_event(TreeEventType.TREE_NODE_UPDATED, {
                "lexical_key": node_key,
                "tree_id": str(tree_node.id()),
                "new_data": new_data
            })
            
            logger.debug(f"Updated tree node: {node_key}")
            
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
            tree_id = str(tree_node.id())
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
            
            logger.debug(f"Removed tree node: {node_key}")
            
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
            
            node_data = tree_node.data()
            element_type = node_data.get("elementType")
            lexical_data = node_data.get("lexical", {})
            
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
                node_data = tree_node.data()
                element_type = node_data.get("elementType")
                
                if element_type == node_type:
                    tree_id = str(tree_node.id())
                    lexical_key = self.mapper.get_lexical_key_by_tree_id(tree_id)
                    if lexical_key:
                        matching_keys.append(lexical_key)
            
            return matching_keys
            
        except Exception as e:
            logger.error(f"Failed to find nodes by type: {e}")
            return []

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
        
        logger.info(f"Enabled collaborative mode for document: {self.doc_id}")

    def disable_collaborative_mode(self) -> None:
        """Disable collaborative editing mode"""
        self.enable_collaboration = False
        self._ephemeral_store = None
        self._subscription_id = None
        
        logger.info(f"Disabled collaborative mode for document: {self.doc_id}")

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

    async def connect_to_websocket_server(self) -> None:
        """Connect to the WebSocket server as a client and request snapshot"""
        try:
            document_url = f"{self.websocket_url}/{self.doc_id}"
            logger.info(f"🔌 LoroTreeModel connecting to {document_url}")
            
            self.websocket = await websockets.connect(document_url)
            self.websocket_connected = True
            logger.info(f"✅ LoroTreeModel connected to WebSocket server for doc: {self.doc_id}")
            
            # Request initial snapshot
            await self._request_snapshot()
            
            # Start listening for messages
            self._websocket_task = asyncio.create_task(self._listen_for_websocket_messages())
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to WebSocket server: {e}")
            self.websocket_connected = False

    async def disconnect_from_websocket_server(self) -> None:
        """Disconnect from the WebSocket server"""
        try:
            if self._websocket_task:
                self._websocket_task.cancel()
                self._websocket_task = None
            
            if self.websocket:
                await self.websocket.close()
                self.websocket = None
            
            self.websocket_connected = False
            logger.info(f"🔌 LoroTreeModel disconnected from WebSocket server for doc: {self.doc_id}")
            
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
            logger.info(f"📸 Requested snapshot for document: {self.doc_id}")
            
        except Exception as e:
            logger.error(f"Failed to request snapshot: {e}")

    async def _listen_for_websocket_messages(self) -> None:
        """Listen for messages from the WebSocket server"""
        if not self.websocket:
            return
            
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    await self._handle_websocket_message(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse WebSocket message: {e}")
                except Exception as e:
                    logger.error(f"Error handling WebSocket message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"WebSocket connection closed for doc: {self.doc_id}")
            self.websocket_connected = False
        except Exception as e:
            logger.error(f"Error in WebSocket message listener: {e}")
            self.websocket_connected = False

    async def _handle_websocket_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming WebSocket message"""
        message_type = data.get("type", "")
        
        if message_type == "update":
            await self._handle_update_message(data)
        elif message_type == "snapshot":
            await self._handle_snapshot_message(data)
        else:
            logger.debug(f"Received unknown WebSocket message type: {message_type}")

    async def _handle_snapshot_message(self, data: Dict[str, Any]) -> None:
        """Handle snapshot message from WebSocket server"""
        try:
            snapshot_data = data.get("snapshot")
            if snapshot_data:
                # Import snapshot into Loro document
                self.doc.import_bytes(bytes(snapshot_data))
                logger.info(f"📸 Applied snapshot for document: {self.doc_id}")
                
                # Update tree reference and synchronize mappings
                self.tree = self.doc.get_tree(self.tree_name)
                self.mapper.sync_existing_nodes()
                
                # Mark as initialized if we got valid content
                if not self._is_initialized:
                    self._is_initialized = True
                    logger.info(f"🎯 Document {self.doc_id} initialized from WebSocket snapshot")
                    
        except Exception as e:
            logger.error(f"Failed to handle snapshot message: {e}")

    async def _handle_update_message(self, data: Dict[str, Any]) -> None:
        """Handle update message from WebSocket server"""
        try:
            update_data = data.get("update")
            if update_data:
                # Apply update to Loro document
                self.doc.import_bytes(bytes(update_data))
                logger.debug(f"📝 Applied update for document: {self.doc_id}")
                
                # Refresh tree reference
                self.tree = self.doc.get_tree(self.tree_name)
                
        except Exception as e:
            logger.error(f"Failed to handle update message: {e}")

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