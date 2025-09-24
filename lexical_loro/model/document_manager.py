# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
TreeDocumentManager: Document management for tree-based collaborative editing

This module manages multiple LoroTreeModel documents and provides coordination
for collaborative editing, document persistence, and MCP protocol integration.

ARCHITECTURE OVERVIEW:
=====================

Document Management:
- Multiple LoroTreeModel instances for different documents
- Lexical JSON persistence with tree-based runtime operations
- Collaborative synchronization between documents
- Event-based communication with WebSocket servers

KEY DESIGN PRINCIPLES:
=====================

1. **Tree-Based Runtime**:
   - All collaborative operations use tree structure
   - Efficient CRDT synchronization and conflict resolution

2. **Lexical JSON Persistence**:
   - Documents saved/loaded as Lexical JSON format
   - Maintains compatibility with existing tools

3. **Event-Driven Coordination**:
   - MCP tools trigger document operations
   - WebSocket server broadcasts changes
   - Real-time collaborative synchronization

4. **Document Lifecycle Management**:
   - Automatic cleanup of inactive documents
   - Memory-efficient resource management
   - Graceful handling of document creation/deletion
"""

import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional, Callable, Set
from pathlib import Path
import time
from concurrent.futures import ThreadPoolExecutor

from .lexical_loro import LoroTreeModel, TreeEventType
from ..constants import DEFAULT_TREE_NAME

logger = logging.getLogger(__name__)


class TreeDocumentManager:
    """
    Manages multiple tree-based collaborative documents
    """

    def __init__(
        self,
        base_path: str = "./documents",
        event_handler: Optional[Callable] = None,
        auto_save_interval: int = 30,
        max_cached_documents: int = 50
    ):
        """
        Initialize document manager
        
        Args:
            base_path: Base directory for document storage
            event_handler: Optional event handler for notifications
            auto_save_interval: Auto-save interval in seconds
            max_cached_documents: Maximum number of documents to keep in memory
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
        
        self._event_handler = event_handler
        self.auto_save_interval = auto_save_interval
        self.max_cached_documents = max_cached_documents
        
        # Document management
        self._documents: Dict[str, LoroTreeModel] = {}
        self._document_access_times: Dict[str, float] = {}
        self._active_documents: Set[str] = set()
        
        # Threading for auto-save and cleanup
        self._executor = ThreadPoolExecutor(max_workers=2)
        self._cleanup_task: Optional[asyncio.Task] = None
        self._auto_save_task: Optional[asyncio.Task] = None
        
        # Start background tasks
        self._start_background_tasks()
        
        logger.debug(f"TreeDocumentManager initialized with base path: {self.base_path}")

    def create_document(
        self,
        doc_id: str,
        initial_content: Optional[Dict[str, Any]] = None,
        enable_collaboration: bool = True
    ) -> LoroTreeModel:
        """
        Create a new document
        
        Args:
            doc_id: Unique document identifier
            initial_content: Optional initial Lexical content
            enable_collaboration: Whether to enable collaborative features
            
        Returns:
            Created LoroTreeModel instance
            
        Raises:
            ValueError: If document already exists
        """
        if doc_id in self._documents:
            raise ValueError(f"Document {doc_id} already exists")
        
        try:
            # Create new tree model with consistent tree name
            model = LoroTreeModel(
                doc_id=doc_id,
                tree_name=DEFAULT_TREE_NAME,  # Use shared constant
                enable_collaboration=enable_collaboration,
                event_handler=self._handle_document_event
            )
            
            # Initialize with content if provided
            if initial_content:
                model.initialize_from_lexical_state(initial_content)
            else:
                # Initialize with minimal default content
                default_content = {
                    "root": {
                        "type": "root",
                        "children": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "type": "text",
                                        "text": "New Document",
                                        "format": 0,
                                        "detail": 0,
                                        "mode": "normal",
                                        "style": ""
                                    }
                                ]
                            }
                        ]
                    }
                }
                model.initialize_from_lexical_state(default_content)
            
            # Register document
            self._documents[doc_id] = model
            self._document_access_times[doc_id] = time.time()
            self._active_documents.add(doc_id)
            
            logger.debug(f"Created document: {doc_id}")
            
            # Emit creation event
            self._emit_event("document_created", {
                "doc_id": doc_id,
                "enable_collaboration": enable_collaboration,
                "initial_content_provided": initial_content is not None
            })
            
            return model
            
        except Exception as e:
            logger.error(f"Failed to create document {doc_id}: {e}")
            raise

    def create_document_for_websocket_sync(
        self,
        doc_id: str,
        enable_collaboration: bool = True
    ) -> LoroTreeModel:
        """
        Create a new empty document that will be populated by WebSocket sync
        
        Args:
            doc_id: Unique document identifier
            enable_collaboration: Whether to enable collaborative features
            
        Returns:
            Created LoroTreeModel instance (not initialized)
            
        Raises:
            ValueError: If document already exists
        """
        if doc_id in self._documents:
            raise ValueError(f"Document {doc_id} already exists")
        
        try:
            # Create new tree model without initialization
            # Use consistent tree name matching all components
            model = LoroTreeModel(
                doc_id=doc_id,
                tree_name=DEFAULT_TREE_NAME,  # Use shared constant
                enable_collaboration=enable_collaboration,
                event_handler=self._handle_document_event
            )
            
            # Register document but don't initialize with content
            # WebSocket will provide the actual content via snapshot
            self._documents[doc_id] = model
            self._document_access_times[doc_id] = time.time()
            self._active_documents.add(doc_id)
            
            logger.debug(f"Created empty document for WebSocket sync: {doc_id}")
            
            # Emit creation event
            self._emit_event("document_created", {
                "doc_id": doc_id,
                "enable_collaboration": enable_collaboration,
                "websocket_sync": True
            })
            
            return model
            
        except Exception as e:
            logger.error(f"Failed to create document for WebSocket sync {doc_id}: {e}")
            raise

    def get_document(self, doc_id: str) -> Optional[LoroTreeModel]:
        """
        Get document by ID, loading from disk if necessary
        
        Args:
            doc_id: Document identifier
            
        Returns:
            LoroTreeModel instance if found, None otherwise
        """
        # Update access time
        self._document_access_times[doc_id] = time.time()
        
        # Return cached document if available
        if doc_id in self._documents:
            self._active_documents.add(doc_id)
            return self._documents[doc_id]
        
        # Try to load from disk
        try:
            file_path = self._get_document_path(doc_id)
            
            if file_path.exists():
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = json.load(f)
                
                # Create model and initialize with loaded content
                model = LoroTreeModel(
                    doc_id=doc_id,
                    tree_name=DEFAULT_TREE_NAME,  # Use shared constant
                    enable_collaboration=True,
                    event_handler=self._handle_document_event
                )
                
                model.initialize_from_lexical_state(content)
                
                # Cache the loaded document
                self._documents[doc_id] = model
                self._active_documents.add(doc_id)
                
                logger.debug(f"Loaded document from disk: {doc_id}")
                
                # Check if we need to clean up cache
                self._cleanup_document_cache()
                
                return model
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to load document {doc_id}: {e}")
            return None

    def save_document(self, doc_id: str, force: bool = False) -> bool:
        """
        Save document to disk
        
        Args:
            doc_id: Document identifier
            force: Force save even if no changes detected
            
        Returns:
            True if saved successfully, False otherwise
        """
        try:
            model = self._documents.get(doc_id)
            if not model:
                logger.warning(f"Cannot save non-existent document: {doc_id}")
                return False
            
            # Check if save is needed (unless forced)
            if not force:
                stats = model.get_document_stats()
                if stats.get("modification_count", 0) == 0:
                    logger.debug(f"No changes to save for document: {doc_id}")
                    return True
            
            # Export to Lexical format
            lexical_state = model.export_to_lexical_state()
            
            # Save to file
            file_path = self._get_document_path(doc_id)
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(lexical_state, f, indent=2, ensure_ascii=False)
            
            logger.debug(f"Saved document: {doc_id}")
            
            # Emit save event
            self._emit_event("document_saved", {
                "doc_id": doc_id,
                "file_path": str(file_path),
                "forced": force
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to save document {doc_id}: {e}")
            return False

    def delete_document(self, doc_id: str, remove_file: bool = True) -> bool:
        """
        Delete document from memory and optionally from disk
        
        Args:
            doc_id: Document identifier
            remove_file: Whether to remove the file from disk
            
        Returns:
            True if deleted successfully, False otherwise
        """
        try:
            # Remove from memory
            if doc_id in self._documents:
                del self._documents[doc_id]
            
            if doc_id in self._document_access_times:
                del self._document_access_times[doc_id]
            
            self._active_documents.discard(doc_id)
            
            # Remove file if requested
            if remove_file:
                file_path = self._get_document_path(doc_id)
                if file_path.exists():
                    file_path.unlink()
                    logger.debug(f"Deleted document file: {file_path}")
            
            logger.debug(f"Deleted document: {doc_id}")
            
            # Emit deletion event
            self._emit_event("document_deleted", {
                "doc_id": doc_id,
                "file_removed": remove_file
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete document {doc_id}: {e}")
            return False

    def list_documents(self, include_stats: bool = False) -> List[Dict[str, Any]]:
        """
        List all available documents
        
        Args:
            include_stats: Whether to include document statistics
            
        Returns:
            List of document information dictionaries
        """
        documents = []
        
        try:
            # Check disk for document files
            for file_path in self.base_path.glob("*.json"):
                doc_id = file_path.stem
                
                doc_info = {
                    "doc_id": doc_id,
                    "file_path": str(file_path),
                    "file_exists": True,
                    "in_memory": doc_id in self._documents,
                    "active": doc_id in self._active_documents,
                    "last_access": self._document_access_times.get(doc_id, 0)
                }
                
                # Add file metadata
                stat = file_path.stat()
                doc_info.update({
                    "file_size": stat.st_size,
                    "modified_time": stat.st_mtime,
                    "created_time": stat.st_ctime
                })
                
                # Add document statistics if requested and document is loaded
                if include_stats and doc_id in self._documents:
                    model = self._documents[doc_id]
                    doc_info["stats"] = model.get_document_stats()
                
                documents.append(doc_info)
            
            # Add memory-only documents that might not be saved yet
            for doc_id in self._documents:
                if not any(doc["doc_id"] == doc_id for doc in documents):
                    doc_info = {
                        "doc_id": doc_id,
                        "file_path": str(self._get_document_path(doc_id)),
                        "file_exists": False,
                        "in_memory": True,
                        "active": doc_id in self._active_documents,
                        "last_access": self._document_access_times.get(doc_id, 0),
                        "file_size": 0,
                        "modified_time": 0,
                        "created_time": time.time()
                    }
                    
                    if include_stats:
                        model = self._documents[doc_id]
                        doc_info["stats"] = model.get_document_stats()
                    
                    documents.append(doc_info)
            
            # Sort by last access time (most recent first)
            documents.sort(key=lambda x: x.get("last_access", 0), reverse=True)
            
            return documents
            
        except Exception as e:
            logger.error(f"Failed to list documents: {e}")
            return []

    def get_manager_stats(self) -> Dict[str, Any]:
        """
        Get document manager statistics
        
        Returns:
            Dictionary with manager statistics
        """
        try:
            cached_docs = len(self._documents)
            active_docs = len(self._active_documents)
            
            # Calculate total memory usage estimate
            total_blocks = 0
            for model in self._documents.values():
                stats = model.get_document_stats()
                tree_stats = stats.get("tree_stats", {})
                total_blocks += tree_stats.get("total_nodes", 0)
            
            # Get disk usage
            disk_files = list(self.base_path.glob("*.json"))
            disk_size = sum(f.stat().st_size for f in disk_files if f.exists())
            
            return {
                "base_path": str(self.base_path),
                "cached_documents": cached_docs,
                "active_documents": active_docs,
                "max_cached_documents": self.max_cached_documents,
                "total_tree_nodes": total_blocks,
                "disk_files": len(disk_files),
                "disk_size_bytes": disk_size,
                "auto_save_interval": self.auto_save_interval,
                "background_tasks_running": {
                    "cleanup_task": self._cleanup_task is not None and not self._cleanup_task.done(),
                    "auto_save_task": self._auto_save_task is not None and not self._auto_save_task.done()
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get manager stats: {e}")
            return {"error": str(e)}

    def close_document(self, doc_id: str, save_before_close: bool = True) -> bool:
        """
        Close document (remove from active set, optionally save)
        
        Args:
            doc_id: Document identifier
            save_before_close: Whether to save before closing
            
        Returns:
            True if closed successfully, False otherwise
        """
        try:
            if doc_id not in self._documents:
                logger.warning(f"Cannot close non-existent document: {doc_id}")
                return False
            
            # Save if requested
            if save_before_close:
                self.save_document(doc_id)
            
            # Remove from active set but keep in cache
            self._active_documents.discard(doc_id)
            
            logger.debug(f"Closed document: {doc_id}")
            
            # Emit close event
            self._emit_event("document_closed", {
                "doc_id": doc_id,
                "saved_before_close": save_before_close
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to close document {doc_id}: {e}")
            return False

    def add_block_to_document(
        self,
        doc_id: str,
        parent_key: str,
        block_data: Dict[str, Any],
        index: Optional[int] = None
    ) -> bool:
        """
        Add block to document using tree operations
        
        Args:
            doc_id: Document identifier
            parent_key: Parent node key
            block_data: Block data to add
            index: Optional position index
            
        Returns:
            True if added successfully, False otherwise
        """
        try:
            model = self.get_document(doc_id)
            if not model:
                logger.error(f"Document not found: {doc_id}")
                return False
            
            # Add block using tree model
            new_key = model.add_block_to_tree(parent_key, block_data, index)
            
            logger.debug(f"Added block to document {doc_id}: {new_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add block to document {doc_id}: {e}")
            return False

    def update_document_block(
        self,
        doc_id: str,
        node_key: str,
        new_data: Dict[str, Any]
    ) -> bool:
        """
        Update block in document using tree operations
        
        Args:
            doc_id: Document identifier
            node_key: Node key to update
            new_data: New block data
            
        Returns:
            True if updated successfully, False otherwise
        """
        try:
            model = self.get_document(doc_id)
            if not model:
                logger.error(f"Document not found: {doc_id}")
                return False
            
            # Update using tree model
            model.update_tree_node(node_key, new_data)
            
            logger.debug(f"Updated block in document {doc_id}: {node_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update block in document {doc_id}: {e}")
            return False

    def remove_document_block(self, doc_id: str, node_key: str) -> bool:
        """
        Remove block from document using tree operations
        
        Args:
            doc_id: Document identifier
            node_key: Node key to remove
            
        Returns:
            True if removed successfully, False otherwise
        """
        try:
            model = self.get_document(doc_id)
            if not model:
                logger.error(f"Document not found: {doc_id}")
                return False
            
            # Remove using tree model
            model.remove_tree_node(node_key)
            
            logger.debug(f"Removed block from document {doc_id}: {node_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to remove block from document {doc_id}: {e}")
            return False

    def find_blocks_in_document(
        self,
        doc_id: str,
        block_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Find blocks in document
        
        Args:
            doc_id: Document identifier
            block_type: Optional type filter
            
        Returns:
            List of matching block information
        """
        try:
            model = self.get_document(doc_id)
            if not model:
                return []
            
            if block_type:
                # Find by specific type
                keys = model.find_nodes_by_type(block_type)
                blocks = []
                for key in keys:
                    block_data = model.get_tree_node_data(key)
                    if block_data:
                        blocks.append({
                            "key": key,
                            "data": block_data
                        })
                return blocks
            else:
                # Export all and extract blocks
                lexical_state = model.export_to_lexical_state()
                root_children = lexical_state.get("root", {}).get("children", [])
                
                blocks = []
                for i, child in enumerate(root_children):
                    blocks.append({
                        "index": i,
                        "data": child
                    })
                return blocks
            
        except Exception as e:
            logger.error(f"Failed to find blocks in document {doc_id}: {e}")
            return []

    def shutdown(self) -> None:
        """
        Shutdown document manager gracefully
        """
        logger.debug("Shutting down TreeDocumentManager...")
        
        try:
            # Cancel background tasks
            if self._cleanup_task and not self._cleanup_task.done():
                self._cleanup_task.cancel()
            
            if self._auto_save_task and not self._auto_save_task.done():
                self._auto_save_task.cancel()
            
            # Save all active documents
            for doc_id in list(self._active_documents):
                try:
                    self.save_document(doc_id, force=True)
                except Exception as e:
                    logger.error(f"Failed to save document {doc_id} during shutdown: {e}")
            
            # Clear document cache
            self._documents.clear()
            self._document_access_times.clear()
            self._active_documents.clear()
            
            # Shutdown executor
            self._executor.shutdown(wait=True)
            
            logger.debug("TreeDocumentManager shutdown complete")
            
        except Exception as e:
            logger.error(f"Error during TreeDocumentManager shutdown: {e}")

    def _get_document_path(self, doc_id: str) -> Path:
        """Get file path for document"""
        return self.base_path / f"{doc_id}.json"

    def _handle_document_event(self, event_type: TreeEventType, data: Dict[str, Any]) -> None:
        """Handle events from document models"""
        try:
            # Forward event to manager's event handler
            if self._event_handler:
                self._event_handler(event_type, {
                    "source": "document_manager",
                    **data
                })
            
            # Handle specific event types
            if event_type == TreeEventType.DOCUMENT_CHANGED:
                doc_id = data.get("doc_id")
                if doc_id:
                    self._document_access_times[doc_id] = time.time()
            
        except Exception as e:
            logger.error(f"Error handling document event: {e}")

    def _emit_event(self, event_type: str, data: Dict[str, Any]) -> None:
        """Emit manager-level event"""
        try:
            if self._event_handler:
                self._event_handler(event_type, {
                    "source": "document_manager",
                    **data
                })
        except Exception as e:
            logger.error(f"Error emitting event: {e}")

    def _start_background_tasks(self) -> None:
        """Start background tasks for auto-save and cleanup"""
        try:
            # Check if we have an event loop
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                # No running event loop, we'll start tasks when one becomes available
                logger.debug("No running event loop found, background tasks will start when event loop is available")
                return
            
            # Start cleanup task
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            
            # Start auto-save task
            self._auto_save_task = asyncio.create_task(self._auto_save_loop())
            
            logger.debug("Started background tasks for document management")
            
        except Exception as e:
            logger.error(f"Failed to start background tasks: {e}")

    async def start_background_tasks_async(self) -> None:
        """Start background tasks in an async context"""
        if hasattr(self, '_cleanup_task') and not self._cleanup_task.done():
            return  # Already started
        
        try:
            # Start cleanup task
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            
            # Start auto-save task
            self._auto_save_task = asyncio.create_task(self._auto_save_loop())
            
            logger.debug("Started background tasks for document management (async)")
            
        except Exception as e:
            logger.error(f"Failed to start background tasks (async): {e}")

    async def _cleanup_loop(self) -> None:
        """Background task for cleaning up inactive documents"""
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                self._cleanup_document_cache()
            except asyncio.CancelledError:
                logger.debug("Cleanup loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")

    async def _auto_save_loop(self) -> None:
        """Background task for auto-saving active documents"""
        while True:
            try:
                await asyncio.sleep(self.auto_save_interval)
                
                # Save all active documents
                for doc_id in list(self._active_documents):
                    try:
                        self.save_document(doc_id)
                    except Exception as e:
                        logger.error(f"Auto-save failed for document {doc_id}: {e}")
                
            except asyncio.CancelledError:
                logger.debug("Auto-save loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in auto-save loop: {e}")

    def _cleanup_document_cache(self) -> None:
        """Clean up document cache if it exceeds the limit"""
        try:
            if len(self._documents) <= self.max_cached_documents:
                return
            
            # Find documents to remove (oldest access time, not active)
            candidates = []
            for doc_id, model in self._documents.items():
                if doc_id not in self._active_documents:
                    access_time = self._document_access_times.get(doc_id, 0)
                    candidates.append((access_time, doc_id))
            
            # Sort by access time (oldest first)
            candidates.sort()
            
            # Remove oldest documents until we're under the limit
            docs_to_remove = len(self._documents) - self.max_cached_documents
            
            for i in range(min(docs_to_remove, len(candidates))):
                _, doc_id = candidates[i]
                
                # Save before removing from cache
                self.save_document(doc_id)
                
                # Remove from memory
                del self._documents[doc_id]
                del self._document_access_times[doc_id]
                
                logger.debug(f"Cleaned up cached document: {doc_id}")
            
        except Exception as e:
            logger.error(f"Error in document cache cleanup: {e}")

    # Additional utility methods for MCP integration
    
    def import_lexical_document(
        self,
        doc_id: str,
        lexical_content: Dict[str, Any]
    ) -> bool:
        """
        Import document from Lexical JSON format
        
        Args:
            doc_id: Document identifier
            lexical_content: Lexical content dictionary
            
        Returns:
            True if imported successfully, False otherwise
        """
        try:
            # Create or get existing document
            model = self.get_document(doc_id)
            if not model:
                model = self.create_document(doc_id, lexical_content)
            else:
                # Clear existing content and reinitialize
                model._clear_document()
                model.initialize_from_lexical_state(lexical_content)
            
            logger.debug(f"Imported Lexical document: {doc_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to import Lexical document {doc_id}: {e}")
            return False

    def export_lexical_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """
        Export document to Lexical JSON format
        
        Args:
            doc_id: Document identifier
            
        Returns:
            Lexical content dictionary if successful, None otherwise
        """
        try:
            model = self.get_document(doc_id)
            if not model:
                return None
            
            lexical_content = model.export_to_lexical_state()
            logger.debug(f"Exported Lexical document: {doc_id}")
            return lexical_content
            
        except Exception as e:
            logger.error(f"Failed to export Lexical document {doc_id}: {e}")
            return None