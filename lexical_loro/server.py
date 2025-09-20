#!/usr/bin/env python3

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Loro WebSocket server for real-time collaboration using loro-py

The server is now a thin WebSocket relay that only manages:
- Client connections
- Message routing 
- Broadcasting responses from LexicalModel

All document logic is handled by LexicalModel.
"""

import asyncio
import json
import logging
import random
import string
import sys
import time
from pathlib import Path
from typing import Dict, Any, Callable, Optional
import websockets
from websockets.legacy.server import WebSocketServerProtocol
from .model.lexical_model import LexicalModel, LexicalDocumentManager
from .client import Client

INITIAL_LEXICAL_JSON = """
{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}
"""

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def default_load_model(doc_id: str) -> Optional[str]:
    """
    Default load_model implementation - loads from local .models folder or returns initial content.
    
    Args:
        doc_id: Document ID to load
        
    Returns:
        Content string from saved file, or initial content for new models
    """
    try:
        # Check if a saved model exists
        models_dir = Path(".models")
        model_file = models_dir / f"{doc_id}.json"
        
        if model_file.exists():
            with open(model_file, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    logger.info(f"📂 Loaded existing model {doc_id} from {model_file}")
                    return content
        
        # No existing file found, return initial content for new documents
        logger.info(f"✨ Creating new model {doc_id} with initial content")
        return INITIAL_LEXICAL_JSON
        
    except Exception as e:
        logger.warning(f"⚠️ Error loading model {doc_id}: {e}, using initial content")
        return INITIAL_LEXICAL_JSON


def default_save_model(doc_id: str, model: LexicalModel) -> bool:
    """
    Default save_model implementation - saves to local .models folder.
    
    Args:
        doc_id: Document ID
        model: LexicalModel instance to save
        
    Returns:
        True if save successful, False otherwise
    """
    try:
        # Create .models directory if it doesn't exist
        models_dir = Path(".models")
        models_dir.mkdir(exist_ok=True)
        
        # Save model as JSON file
        model_file = models_dir / f"{doc_id}.json"
        model_data = model.to_json()
        
        with open(model_file, 'w', encoding='utf-8') as f:
            f.write(model_data)
        
        logger.info(f"💾 Saved model {doc_id} to {model_file}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save model {doc_id}: {e}")
        return False


class LoroWebSocketServer:
    """
    Pure WebSocket Relay Server with Multi-Document Support
    
    This server is a thin relay that only handles:
    - WebSocket client connections
    - Message routing to LexicalDocumentManager
    - Broadcasting responses from models
    
    All document and ephemeral data management is delegated to LexicalDocumentManager.
    """
    
    def __init__(self, port: int = 8081, host: str = "localhost", 
                 load_model: Optional[Callable[[str], Optional[str]]] = None,
                 save_model: Optional[Callable[[str, LexicalModel], bool]] = None,
                 autosave_interval_sec: int = 5):
        self.port = port
        self.host = host
        self.clients: Dict[str, Client] = {}
        
        # Model persistence functions
        self.load_model = load_model or default_load_model
        self.save_model = save_model or default_save_model
        self.autosave_interval_sec = autosave_interval_sec  # Auto-save interval in seconds
        
        self.document_manager = LexicalDocumentManager(
            event_callback=self._on_document_event,
            ephemeral_timeout=300000  # 5 minutes ephemeral timeout
        )
        self.running = False
        self._autosave_task: Optional[asyncio.Task] = None
    
    def get_document(self, doc_id: str) -> LexicalModel:
        """
        Get or create a document through the document manager.
        Uses the load_model function to get initial content only for new documents.
        """
        # Check if document already exists
        if doc_id in self.document_manager.models:
            # Document exists, return it without calling load_model
            return self.document_manager.models[doc_id]
        
        # Document doesn't exist, load content and create it
        initial_content = self.load_model(doc_id)
        model = self.document_manager.get_or_create_document(doc_id, initial_content)
        
        # Mark the model as saved since we just loaded it from storage
        # or created it with initial content. This prevents unnecessary
        # saves of documents that haven't been modified yet.
        model.mark_as_saved()
        logger.debug(f"📌 Marked document {doc_id} as saved after loading/creation")
        
        return model

    def _extract_doc_id_from_websocket(self, websocket: WebSocketServerProtocol) -> str:
        """
        Extract document ID from WebSocket request.
        Checks multiple sources in order of preference:
        1. Query parameter 'docId' or 'doc_id'
        2. Path segments for specific patterns:
           - /api/spacer/v1/lexical/ws/{DOC_ID}
           - /{DOC_ID} (direct path)
           - /ws/models/{DOC_ID}
           - /models/{DOC_ID}
        
        Raises ValueError if no valid document ID is found.
        """
        logger.info(f"🔍 _extract_doc_id_from_websocket called with websocket: {websocket}")
        
        # The websockets library stores the path in different attributes
        path = None
        if hasattr(websocket, 'path'):
            path = websocket.path
        elif hasattr(websocket, 'request_uri'):
            path = websocket.request_uri
        elif hasattr(websocket, 'uri'):
            path = websocket.uri
        elif hasattr(websocket, 'request') and hasattr(websocket.request, 'path'):
            path = websocket.request.path
        
        logger.info(f"🔍 Extracted path: {path}")
        
        if not path:
            logger.error(f"❌ Could not extract path from WebSocket object")
            raise ValueError("No path found in WebSocket request")
        
        try:
            # Parse query string from path
            from urllib.parse import urlparse, parse_qs
            parsed_url = urlparse(path)
            query_params = parse_qs(parsed_url.query)
            
            logger.info(f"🔍 Parsed URL: {parsed_url}")
            logger.info(f"🔍 Query params: {query_params}")
            logger.info(f"🔍 Path: {parsed_url.path}")
            
            # Check for docId or doc_id parameter
            if 'docId' in query_params and query_params['docId']:
                doc_id = query_params['docId'][0]
                logger.info(f"📄 Document ID from query param 'docId': {doc_id}")
                return doc_id
            elif 'doc_id' in query_params and query_params['doc_id']:
                doc_id = query_params['doc_id'][0]
                logger.info(f"📄 Document ID from query param 'doc_id': {doc_id}")
                return doc_id
            
            # Parse path segments
            path_segments = [seg for seg in parsed_url.path.split('/') if seg]
            logger.info(f"🔍 Path segments: {path_segments}")
            
            # Pattern 1: /api/spacer/v1/lexical/ws/{DOC_ID}
            if (len(path_segments) >= 6 and 
                path_segments[0] == 'api' and 
                path_segments[1] == 'spacer' and
                path_segments[2] == 'v1' and
                path_segments[3] == 'lexical' and
                path_segments[4] == 'ws'):
                doc_id = path_segments[5]
                logger.info(f"📄 Document ID from Spacer API pattern: {doc_id}")
                return doc_id
            
            # Pattern 2: /ws/models/{DOC_ID} or /models/{DOC_ID}
            elif len(path_segments) >= 2 and path_segments[-2] in ['models', 'docs', 'doc']:
                doc_id = path_segments[-1]
                logger.info(f"📄 Document ID from models path: {doc_id}")
                return doc_id
            
            # Pattern 3: /{DOC_ID} (direct path - last segment)
            elif len(path_segments) >= 1:
                # Use last path segment as potential doc_id if it looks like a document ID
                potential_doc_id = path_segments[-1]
                logger.info(f"🔍 Checking potential doc_id: {potential_doc_id}")
                
                # Exclude common WebSocket endpoint names but be more permissive
                # Allow document IDs that contain common words but are clearly document identifiers
                excluded_endpoints = ['ws', 'websocket', 'socket', 'api', 'v1']
                
                if potential_doc_id not in excluded_endpoints:
                    # Additional validation: if it contains hyphens or underscores, likely a doc ID
                    # Or if it's longer than 3 characters and not in excluded list
                    has_separators = '-' in potential_doc_id or '_' in potential_doc_id
                    is_long_enough = len(potential_doc_id) > 3 and potential_doc_id not in excluded_endpoints
                    
                    logger.info(f"🔍 Validation check: has_separators={has_separators}, is_long_enough={is_long_enough}")
                    
                    if (has_separators or is_long_enough):
                        logger.info(f"📄 Document ID from last path segment: {potential_doc_id}")
                        return potential_doc_id
                    else:
                        logger.info(f"🔍 Potential doc_id '{potential_doc_id}' failed validation")
                else:
                    logger.info(f"🔍 Potential doc_id '{potential_doc_id}' is in excluded endpoints")
            else:
                logger.info(f"🔍 No path segments found")
            
        except Exception as e:
            logger.warning(f"⚠️ Error extracting document ID from WebSocket: {e}")
            import traceback
            logger.warning(f"⚠️ Traceback: {traceback.format_exc()}")
        
        # No fallback - raise error if no document ID found
        logger.error(f"❌ No document ID found in WebSocket request. WebSocket path: {path}")
        raise ValueError("No document ID found in WebSocket request. Please provide docId as query parameter or in path.")

    def _on_document_event(self, event_type: str, event_data: dict):
        """
        Handle events from LexicalDocumentManager.
        Server only handles broadcasting, no document logic.
        """
        try:
            logger.debug(f"🔔 _on_document_event: Received event_type='{event_type}'")
            logger.debug(f"🔔 _on_document_event: event_data keys: {list(event_data.keys())}")
            
            if event_type in ["ephemeral_changed", "broadcast_needed"]:
                # Schedule async broadcasting
                logger.debug(f"📡 _on_document_event: Scheduling broadcast for event_type='{event_type}'")
                self._schedule_broadcast(event_data)
                
            elif event_type == "document_changed":
                # Just log document changes, no server action needed
                doc_id = event_data.get('doc_id', 'unknown')
                container_id = event_data.get('container_id', 'unknown')
                logger.info(f"📄 Document changed: {doc_id} ({container_id})")
                
            elif event_type == "document_created":
                # Log new document creation
                doc_id = event_data.get('doc_id', 'unknown')
                logger.info(f"🧠 Created document: {doc_id}")
                
            elif event_type == "document_removed":
                # Log document removal
                doc_id = event_data.get('doc_id', 'unknown')
                logger.info(f"🗑️ Removed document: {doc_id}")
                
        except Exception as e:
            logger.error(f"❌ Error in event processing: {e}")
    
    def _schedule_broadcast(self, event_data: dict):
        """Schedule async broadcasting safely"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.call_soon(lambda: asyncio.create_task(self._handle_broadcast(event_data)))
        except Exception as e:
            logger.error(f"❌ Error scheduling broadcast: {e}")
    
    async def _handle_broadcast(self, event_data: dict):
        """Handle broadcasting from model events"""
        try:
            logger.debug(f"📡 _handle_broadcast: Processing broadcast")
            logger.debug(f"📡 _handle_broadcast: event_data keys: {list(event_data.keys())}")
            
            broadcast_data = event_data.get("broadcast_data")
            client_id = event_data.get("client_id")
            
            logger.debug(f"📡 _handle_broadcast: broadcast_data exists: {broadcast_data is not None}")
            logger.debug(f"📡 _handle_broadcast: client_id: {client_id}")
            
            if broadcast_data and client_id:
                logger.info(f"📡 Broadcasting message to other clients (sender: {client_id})")
                await self.broadcast_to_other_clients(client_id, broadcast_data)
            else:
                logger.warning(f"📡 _handle_broadcast: Missing data - broadcast_data: {broadcast_data is not None}, client_id: {client_id}")
                
        except Exception as e:
            logger.error(f"❌ Error in broadcast handling: {e}")
            import traceback
            logger.error(f"❌ Broadcast error traceback: {traceback.format_exc()}")
    
    async def _autosave_models(self):
        """Periodically auto-save all models at the configured interval"""
        logger.info(f"🚀 Auto-save task started with interval: {self.autosave_interval_sec} seconds")
        
        while self.running:
            try:
                await asyncio.sleep(self.autosave_interval_sec)  # Use configurable interval
                if self.running:
                    doc_ids = self.document_manager.list_models()
                    logger.debug(f"🔍 Auto-save check: found {len(doc_ids)} documents")
                    
                    if doc_ids:
                        logger.info(f"🔄 Auto-saving {len(doc_ids)} models every {self.autosave_interval_sec} seconds...")
                        saved_count = 0
                        unchanged_count = 0
                        for doc_id in doc_ids:
                            try:
                                # Get existing model without triggering load (model already exists)
                                if doc_id in self.document_manager.models:
                                    model = self.document_manager.models[doc_id]
                                    
                                    # Check if the document has changed since last save
                                    if model.has_changed_since_last_save():
                                        success = self.save_model(doc_id, model)
                                        if success:
                                            # Mark the model as saved to track the current state
                                            model.mark_as_saved()
                                            saved_count += 1
                                            logger.info(f"💾 Auto-saved document: {doc_id}")
                                        else:
                                            logger.warning(f"⚠️ Auto-save failed for document: {doc_id}")
                                    else:
                                        unchanged_count += 1
                                        logger.debug(f"⏭️ Skipping auto-save for unchanged document: {doc_id}")
                                else:
                                    logger.warning(f"⚠️ Document {doc_id} not found during auto-save")
                            except Exception as e:
                                logger.error(f"❌ Error auto-saving document {doc_id}: {e}")
                        
                        if saved_count > 0:
                            logger.info(f"✅ Auto-save completed: {saved_count} saved, {unchanged_count} unchanged")
                        elif unchanged_count > 0:
                            logger.debug(f"ℹ️ Auto-save check: {unchanged_count} documents unchanged, none saved")
                    else:
                        logger.debug(f"🔍 No documents to auto-save")
                    
            except asyncio.CancelledError:
                logger.info("🛑 Auto-save task cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in auto-save loop: {e}")
        
        logger.info("✅ Auto-save task stopped")
    
    def save_all_models(self) -> Dict[str, bool]:
        """
        Manually save all models using the save_model function.
        
        Returns:
            Dictionary mapping doc_id to save success status
        """
        results = {}
        doc_ids = self.document_manager.list_models()
        
        logger.info(f"💾 Manually saving {len(doc_ids)} models...")
        saved_count = 0
        unchanged_count = 0
        
        for doc_id in doc_ids:
            try:
                # Get existing model without triggering load (model already exists)
                if doc_id in self.document_manager.models:
                    model = self.document_manager.models[doc_id]
                    
                    # Check if the document has changed since last save
                    if model.has_changed_since_last_save():
                        success = self.save_model(doc_id, model)
                        results[doc_id] = success
                        
                        if success:
                            # Mark the model as saved to track the current state
                            model.mark_as_saved()
                            saved_count += 1
                            logger.info(f"💾 Manually saved document: {doc_id}")
                        else:
                            logger.warning(f"⚠️ Failed to save document: {doc_id}")
                    else:
                        # Document hasn't changed, consider it a successful "save"
                        results[doc_id] = True
                        unchanged_count += 1
                        logger.debug(f"⏭️ Skipping manual save for unchanged document: {doc_id}")
                else:
                    logger.warning(f"⚠️ Document {doc_id} not found during manual save")
                    results[doc_id] = False
                    
            except Exception as e:
                logger.error(f"❌ Error saving document {doc_id}: {e}")
                results[doc_id] = False
        
        logger.info(f"✅ Manual save completed: {saved_count} saved, {unchanged_count} unchanged")
        return results
    
    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Starting Loro WebSocket Relay Server")
        logger.info(f"   Host: {self.host}")
        logger.info(f"   Port: {self.port}")
        logger.info(f"   Auto-save interval: {self.autosave_interval_sec} seconds")
        logger.info(f"   Document manager timeout: {self.document_manager.ephemeral_timeout}ms")
        
        self.running = True
        
        # Start the WebSocket server
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info(f"✅ WebSocket Server Ready!")
            logger.info(f"   URL: ws://{self.host}:{self.port}")
            logger.info(f"   Ping interval: 20s")
            logger.info(f"   Ping timeout: 10s")
            logger.info(f"   Change tracking: enabled")
            logger.info(f"   Ready to accept connections...")
            
            # Start background tasks
            logger.info(f"🔄 Starting background services...")
            stats_task = asyncio.create_task(self.log_stats())
            self._autosave_task = asyncio.create_task(self._autosave_models())
            logger.info(f"   ✓ Statistics logging (30s interval)")
            logger.info(f"   ✓ Auto-save service ({self.autosave_interval_sec}s interval)")
            
            try:
                # Keep the server running until interrupted
                while self.running:
                    await asyncio.sleep(1)
            except (KeyboardInterrupt, asyncio.CancelledError):
                logger.info("🛑 Server shutdown requested")
            finally:
                self.running = False
                
                # Cancel background tasks
                stats_task.cancel()
                if self._autosave_task:
                    self._autosave_task.cancel()
                
                try:
                    await stats_task
                except asyncio.CancelledError:
                    pass
                
                try:
                    if self._autosave_task:
                        await self._autosave_task
                except asyncio.CancelledError:
                    pass
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a new client connection"""
        client_id = self.generate_client_id()
        client = Client(websocket, client_id)
        
        # Log detailed connection information
        remote_address = getattr(websocket, 'remote_address', 'unknown')
        path = getattr(websocket, 'path', 'unknown')
        headers = dict(getattr(websocket, 'request_headers', {}))
        
        logger.info(f"🔌 New WebSocket connection attempt:")
        logger.info(f"   Client ID: {client_id}")
        logger.info(f"   Remote Address: {remote_address}")
        logger.info(f"   Path: {path}")
        logger.info(f"   User-Agent: {headers.get('user-agent', 'unknown')}")
        logger.info(f"   Origin: {headers.get('origin', 'unknown')}")
        
        try:
            # Extract document ID from WebSocket request
            doc_id = self._extract_doc_id_from_websocket(websocket)
            logger.info(f"📄 Client {client_id} requesting document: '{doc_id}'")
        except ValueError as e:
            # Send error message and close connection if no document ID found
            logger.error(f"❌ Client {client_id} connection rejected: {e}")
            logger.error(f"   Remote: {remote_address}, Path: {path}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e),
                "code": "MISSING_DOCUMENT_ID"
            }))
            await websocket.close()
            return
        
        self.clients[client_id] = client
        logger.info(f"✅ Client {client_id} successfully connected:")
        logger.info(f"   Document: '{doc_id}'")
        logger.info(f"   Color: {client.color}")
        logger.info(f"   Total clients: {len(self.clients)}")
        logger.info(f"   Connection details: {remote_address} -> {path}")
        
        try:
            # Send welcome message with document info
            welcome_msg = {
                "type": "welcome",
                "clientId": client_id,
                "color": client.color,
                "docId": doc_id,
                "message": "Connected to Loro CRDT relay (Python)"
            }
            await websocket.send(json.dumps(welcome_msg))
            logger.info(f"👋 Sent welcome message to client {client_id}")
            
            # Send initial snapshots to the new client for the specific document
            await self.send_initial_snapshots(websocket, client_id, doc_id)
            
            # Listen for messages from this client
            logger.info(f"👂 Started listening for messages from client {client_id}")
            async for message in websocket:
                logger.debug(f"📨 Received message from {client_id}: {len(message)} bytes")
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed as e:
            close_code = getattr(e, 'code', 'unknown')
            close_reason = getattr(e, 'reason', 'unknown')
            logger.info(f"📴 Client {client_id} disconnected normally:")
            logger.info(f"   Close code: {close_code}")
            logger.info(f"   Close reason: {close_reason}")
            logger.info(f"   Document: '{doc_id}'")
        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"❌ Unexpected error handling client {client_id}:")
            logger.error(f"   Error type: {error_type}")
            logger.error(f"   Error message: {e}")
            logger.error(f"   Document: '{doc_id}'")
            logger.error(f"   Remote: {remote_address}")
        finally:
            # Delegate client cleanup to DocumentManager
            logger.info(f"🧹 Starting cleanup for client {client_id}:")
            logger.info(f"   Document: '{doc_id}'")
            logger.info(f"   Connection duration: active session ended")
            
            cleanup_count = 0
            # Clean up client data in all managed models
            for cleanup_doc_id in self.document_manager.list_models():
                try:
                    # Get existing model without triggering load (model already exists)
                    if cleanup_doc_id in self.document_manager.models:
                        model = self.document_manager.models[cleanup_doc_id]
                        response = model.handle_client_disconnect(client_id)
                        if response.get("success"):
                            removed_keys = response.get("removed_keys", [])
                            if removed_keys:
                                cleanup_count += 1
                                logger.info(f"🧹 Cleaned up client {client_id} data in {cleanup_doc_id} ({len(removed_keys)} keys)")
                except Exception as e:
                    logger.error(f"❌ Error cleaning up client {client_id} in {cleanup_doc_id}: {e}")
            
            # Remove client from server
            if client_id in self.clients:
                del self.clients[client_id]
                logger.info(f"🗑️ Removed client {client_id} from active clients list")
            
            logger.info(f"✅ Client {client_id} cleanup complete:")
            logger.info(f"   Cleaned up data in {cleanup_count} documents")
            logger.info(f"   Remaining clients: {len(self.clients)}")
            logger.info(f"   Active documents: {len(self.document_manager.list_models())}")
    
    async def send_initial_snapshots(self, websocket: WebSocketServerProtocol, client_id: str, doc_id: str):
        """
        Send initial snapshot for the specified document.
        Create document with initial content and send snapshot.
        """
        logger.info(f"📸 Preparing initial snapshot for client {client_id}:")
        logger.info(f"   Document: '{doc_id}'")
            
        try:
            # Ensure document exists with initial content
            logger.debug(f"🔍 Getting/creating document '{doc_id}' for initial snapshot")
            document = self.get_document(doc_id)  # This will create with initial content if needed
            
            # Now get the snapshot
            logger.debug(f"📊 Retrieving CRDT snapshot for document '{doc_id}'")
            snapshot_bytes = self.document_manager.get_snapshot(doc_id)
            
            # Check if document has content - either in CRDT snapshot or lexical data
            has_content = False
            lexical_blocks = 0
            if snapshot_bytes and len(snapshot_bytes) > 0:
                has_content = True
                logger.debug(f"✅ CRDT snapshot available: {len(snapshot_bytes)} bytes")
            elif document and hasattr(document, 'lexical_data') and document.lexical_data:
                # Even if CRDT snapshot is empty, check if document has lexical content
                lexical_root = document.lexical_data.get("root", {})
                children = lexical_root.get("children", [])
                lexical_blocks = len(children)
                has_content = lexical_blocks > 0
                logger.debug(f"📝 Lexical content available: {lexical_blocks} blocks")
            
            if snapshot_bytes and len(snapshot_bytes) > 0:
                # Convert bytes to list of integers for JSON serialization
                snapshot_data = list(snapshot_bytes)
                snapshot_msg = {
                    "type": "initial-snapshot",
                    "snapshot": snapshot_data,
                    "docId": doc_id,
                    "hasData": True,
                    "hasEvent": True,
                    "hasSnapshot": True,
                    "clientId": client_id,
                    "dataLength": len(snapshot_bytes)
                }
                await websocket.send(json.dumps(snapshot_msg))
                logger.info(f"� Sent initial snapshot to client {client_id}:")
                logger.info(f"   Document: '{doc_id}'")
                logger.info(f"   Snapshot size: {len(snapshot_bytes)} bytes")
                logger.info(f"   Lexical blocks: {lexical_blocks}")
            else:
                # Even without CRDT snapshot, we can still send initial content if document exists
                snapshot_msg = {
                    "type": "initial-snapshot",
                    "docId": doc_id,
                    "hasData": has_content,  # Based on content check, not just snapshot
                    "hasEvent": has_content,  # Based on content check, not just snapshot
                    "hasSnapshot": False,  # No CRDT snapshot available
                    "clientId": client_id,
                    "dataLength": 0
                }
                await websocket.send(json.dumps(snapshot_msg))
                logger.info(f"� Sent initial state to client {client_id}:")
                logger.info(f"   Document: '{doc_id}'")
                logger.info(f"   Has content: {has_content}")
                logger.info(f"   Lexical blocks: {lexical_blocks}")
                logger.info(f"   CRDT snapshot: not available")
                
        except Exception as e:
            error_type = type(e).__name__
            logger.error(f"❌ Error sending snapshot to client {client_id}:")
            logger.error(f"   Document: '{doc_id}'")
            logger.error(f"   Error type: {error_type}")
            logger.error(f"   Error message: {e}")
    
    async def handle_message(self, client_id: str, message: str):
        """
        Handle a message from a client.
        Pure delegation to LexicalModel - server doesn't process messages.
        """
        message_start_time = time.time()
        
        try:
            # Parse the message
            logger.debug(f"🔍 Parsing message from client {client_id}: {len(message)} chars")
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId")
            
            # DEBUG: Log data type and content for append-paragraph messages
            if message_type == "append-paragraph":
                logger.debug(f"🔍 SERVER: append-paragraph data type = {type(data)}")
                logger.debug(f"🔍 SERVER: append-paragraph data = {data}")
            
            logger.info(f"📨 Processing message from client {client_id}:")
            logger.info(f"   Type: '{message_type}'")
            logger.info(f"   Document: '{doc_id}'")
            logger.info(f"   Message size: {len(message)} bytes")
            
            # Log additional details for specific message types
            if message_type == "loro-update":
                update_data = data.get("update", [])
                logger.debug(f"   Update data size: {len(update_data)} bytes")
            elif message_type == "ephemeral-update":
                ephemeral_data = data.get("data", {})
                if isinstance(ephemeral_data, dict):
                    logger.debug(f"   Ephemeral data keys: {list(ephemeral_data.keys())}")
                else:
                    logger.debug(f"   Ephemeral data type: {type(ephemeral_data)}, length: {len(ephemeral_data) if hasattr(ephemeral_data, '__len__') else 'N/A'}")
            elif message_type == "snapshot":
                snapshot_data = data.get("snapshot", [])
                logger.debug(f"   Snapshot data size: {len(snapshot_data)} bytes")
            
            # Validate that docId is provided in the message
            if not doc_id:
                logger.error(f"❌ Message validation failed for client {client_id}:")
                logger.error(f"   Message type: '{message_type}' missing 'docId' field")
                raise ValueError(f"Message of type '{message_type}' missing required 'docId' field")
            
            # Add client color to data for better UX
            client = self.clients.get(client_id)
            if client and "color" not in data:
                data["color"] = client.color
                logger.debug(f"   Added client color: {client.color}")
            
            # Delegate message handling to DocumentManager
            logger.debug(f"🔄 Delegating message to DocumentManager...")
            response = await self.document_manager.handle_message(doc_id, message_type, data, client_id)
            
            # Calculate processing time
            processing_time = (time.time() - message_start_time) * 1000  # Convert to milliseconds
            logger.debug(f"⏱️ Message processed in {processing_time:.2f}ms")
            
            # Log LexicalModel state after ephemeral updates
            ephemeral_message_types = ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]
            if message_type in ephemeral_message_types:
                model = self.get_document(doc_id)
                logger.debug(f"🔄 LexicalModel after ephemeral update: {repr(model)}")
            
            # Handle the response
            await self._handle_model_response(response, client_id, doc_id)
            
            logger.info(f"✅ Message handling completed for client {client_id}:")
            logger.info(f"   Type: '{message_type}', Doc: '{doc_id}', Time: {processing_time:.2f}ms")
                
        except json.JSONDecodeError as e:
            logger.error(f"❌ JSON parsing error from client {client_id}:")
            logger.error(f"   Error: {e}")
            logger.error(f"   Message preview: {message[:200]}...")
            await self._send_error_to_client(client_id, "Invalid message format")
        except Exception as e:
            error_type = type(e).__name__
            processing_time = (time.time() - message_start_time) * 1000
            logger.error(f"❌ Message processing error for client {client_id}:")
            logger.error(f"   Error type: {error_type}")
            logger.error(f"   Error message: {e}")
            logger.error(f"   Processing time: {processing_time:.2f}ms")
            await self._send_error_to_client(client_id, f"Server error: {str(e)}")
    
    async def _handle_model_response(self, response: Dict[str, Any], client_id: str, doc_id: str):
        """
        Handle structured response from LexicalModel methods.
        Server only handles success/error and direct responses.
        """
        message_type = response.get("message_type", "unknown")
        
        if not response.get("success"):
            # Handle error response
            error_msg = response.get("error", "Unknown error")
            logger.error(f"❌ {message_type} failed: {error_msg}")
            await self._send_error_to_client(client_id, f"{message_type} failed: {error_msg}")
            return
        
        # Handle successful response
        logger.info(f"✅ {message_type} succeeded for {doc_id}")
        
        # Handle direct response to sender (like snapshot responses)
        if response.get("response_needed"):
            response_data = response.get("response_data", {})
            client = self.clients.get(client_id)
            if client:
                try:
                    await client.websocket.send(json.dumps(response_data))
                    logger.info(f"📤 Sent {response_data.get('type', 'response')} to {client_id}")
                except Exception as e:
                    logger.error(f"❌ Failed to send response to {client_id}: {e}")
        
        # Log document info if provided
        if response.get("document_info"):
            doc_info = response["document_info"]
            logger.info(f"📋 {doc_id}: {doc_info.get('content_length', 0)} chars")
    
    async def _send_error_to_client(self, client_id: str, error_message: str):
        """Send error message to client"""
        client = self.clients.get(client_id)
        if client:
            try:
                await client.websocket.send(json.dumps({
                    "type": "error",
                    "message": error_message
                }))
            except Exception as e:
                logger.error(f"❌ Failed to send error to {client_id}: {e}")
    
    async def broadcast_to_other_clients(self, sender_id: str, message: dict):
        """
        Broadcast a message to all clients except the sender.
        Pure broadcasting function - no document logic.
        """
        total_clients = len(self.clients)
        
        message_type = message.get("type", "unknown")
        doc_id = message.get("docId", "unknown")
        
        logger.info(f"📡 Broadcasting message from {sender_id}:")
        logger.info(f"   Type: '{message_type}'")
        logger.info(f"   Document: '{doc_id}'")
        logger.info(f"   Total clients: {total_clients}")
        logger.info(f"   All client IDs: {list(self.clients.keys())}")
        
        if total_clients == 0:
            logger.warning(f"📡 No clients connected - cannot broadcast")
            return
        
        # For document updates, we should broadcast to ALL clients
        # including the sender, so their editor gets updated too
        # NOTE: Removed 'snapshot' from broadcast list as we now use pure incremental updates
        should_include_sender = message_type in ["document-update", "loro-update"]
        target_count = total_clients if should_include_sender else total_clients - 1
        
        logger.info(f"   Target clients: {target_count} (include sender: {should_include_sender})")
        
        message_str = json.dumps(message)
        message_size = len(message_str)
        logger.info(f"   Message size: {message_size} bytes")
        logger.debug(f"   Message preview: {message_str[:200]}...")
        
        failed_clients = []
        successful_sends = 0
        
        # Create a copy of clients to avoid "dictionary changed size during iteration" error
        clients_copy = dict(self.clients)
        
        for client_id, client in clients_copy.items():
            # Skip sender only if we shouldn't include them
            if not should_include_sender and client_id == sender_id:
                logger.debug(f"   ⏭️ Skipping sender {client_id}")
                continue
            
            try:
                logger.debug(f"   📤 Attempting to send to client {client_id}")
                # Check if websocket is still valid before sending
                # For websockets.ServerConnection, check if it's closed instead of open
                if hasattr(client.websocket, 'closed') and client.websocket.closed:
                    logger.warning(f"⚠️ Skipping broadcast to closed connection: {client_id}")
                    failed_clients.append(client_id)
                else:
                    await client.websocket.send(message_str)
                    successful_sends += 1
                    sender_note = " (sender)" if client_id == sender_id else ""
                    logger.info(f"   ✅ Successfully sent to client {client_id}{sender_note}")
            except (websockets.exceptions.ConnectionClosed, Exception) as e:
                error_type = type(e).__name__
                logger.warning(f"⚠️ Broadcast failed to client {client_id}:")
                logger.warning(f"   Error type: {error_type}")
                logger.warning(f"   Error: {e}")
                failed_clients.append(client_id)
        
        # Remove failed clients safely
        for client_id in failed_clients:
            if client_id in self.clients:
                del self.clients[client_id]
                logger.info(f"🧹 Removed disconnected client {client_id} from active list")
        
        logger.info(f"✅ Broadcast completed:")
        logger.info(f"   Successful: {successful_sends}")
        logger.info(f"   Failed: {len(failed_clients)}")
        logger.info(f"   Message: '{message_type}' for '{doc_id}'")
    
    def generate_client_id(self) -> str:
        """Generate a unique client ID"""
        timestamp = int(time.time() * 1000)
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        return f"py_client_{timestamp}_{suffix}"
    
    async def log_stats(self):
        """Log server statistics periodically"""
        while self.running:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                if self.running:
                    # Clean up stale connections
                    stale_clients = []
                    active_connections = 0
                    
                    for client_id, client in list(self.clients.items()):
                        try:
                            if hasattr(client.websocket, 'ping'):
                                await asyncio.wait_for(client.websocket.ping(), timeout=5.0)
                                active_connections += 1
                        except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed, Exception) as e:
                            logger.debug(f"🧹 Detected stale connection for client {client_id}: {type(e).__name__}")
                            stale_clients.append(client_id)
                    
                    # Remove stale clients
                    for client_id in stale_clients:
                        if client_id in self.clients:
                            logger.info(f"🧹 Removing stale client {client_id}")
                            try:
                                await self.clients[client_id].websocket.close()
                            except:
                                pass
                            del self.clients[client_id]
                    
                    # Collect detailed stats
                    doc_count = len(self.document_manager.list_models())
                    client_count = len(self.clients)
                    doc_ids = self.document_manager.list_models()
                    
                    # Log comprehensive stats
                    logger.info(f"📊 WebSocket Server Statistics:")
                    logger.info(f"   Active clients: {client_count}")
                    logger.info(f"   Active connections: {active_connections}")
                    logger.info(f"   Stale connections removed: {len(stale_clients)}")
                    logger.info(f"   Managed documents: {doc_count}")
                    
                    if doc_ids:
                        logger.debug(f"   Document IDs: {', '.join(doc_ids[:5])}{'...' if len(doc_ids) > 5 else ''}")
                    
                    # Log client details at debug level
                    if client_count > 0:
                        client_ids = list(self.clients.keys())
                        logger.debug(f"   Client IDs: {', '.join(client_ids[:3])}{'...' if len(client_ids) > 3 else ''}")
                    
            except asyncio.CancelledError:
                logger.debug("📊 Stats logging task cancelled")
                break
            except Exception as e:
                logger.error(f"❌ Error in stats loop: {type(e).__name__}: {e}")
    
    async def shutdown(self):
        """Gracefully shutdown the server"""
        logger.info("🛑 Shutting down Loro WebSocket relay...")
        self.running = False
        
        # Cancel auto-save task
        if self._autosave_task:
            self._autosave_task.cancel()
            try:
                await self._autosave_task
            except asyncio.CancelledError:
                pass
        
        # Perform final save of all models
        logger.info("💾 Performing final save of all models...")
        doc_ids = self.document_manager.list_models()
        saved_count = 0
        unchanged_count = 0
        for doc_id in doc_ids:
            try:
                # Get existing model without triggering load (model already exists)
                if doc_id in self.document_manager.models:
                    model = self.document_manager.models[doc_id]
                    
                    # Check if the document has changed since last save
                    if model.has_changed_since_last_save():
                        success = self.save_model(doc_id, model)
                        if success:
                            # Mark the model as saved to track the current state
                            model.mark_as_saved()
                            saved_count += 1
                            logger.info(f"💾 Final save completed for model {doc_id}")
                        else:
                            logger.warning(f"⚠️ Final save failed for model {doc_id}")
                    else:
                        unchanged_count += 1
                        logger.debug(f"⏭️ Skipping final save for unchanged document: {doc_id}")
                else:
                    logger.warning(f"⚠️ Document {doc_id} not found during final save")
            except Exception as e:
                logger.error(f"❌ Error during final save of model {doc_id}: {e}")
        
        logger.info(f"✅ Final save completed: {saved_count} saved, {unchanged_count} unchanged")
        
        # Close all client connections
        clients_to_close = list(self.clients.values())
        for client in clients_to_close:
            try:
                await client.websocket.close()
            except Exception:
                pass
        
        self.clients.clear()
        
        # Clean up document manager
        self.document_manager.cleanup()
        
        logger.info("✅ Relay shutdown complete")


async def main():
    """Main entry point"""
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
    #         logger.error(f"❌ Custom load failed for {doc_id}: {e}")
    #     # Fall back to default initial content
    #     return INITIAL_LEXICAL_JSON
    
    # def custom_save_model(doc_id: str, model: LexicalModel) -> bool:
    #     """Custom model saver - could save to database, API, etc."""
    #     try:
    #         # Example: Save to custom location
    #         custom_dir = Path("custom_models")
    #         custom_dir.mkdir(exist_ok=True)
    #         custom_file = custom_dir / f"{doc_id}.json"
    #         
    #         model_data = model.to_json()
    #         with open(custom_file, 'w', encoding='utf-8') as f:
    #             f.write(model_data)
    #         logger.info(f"💾 Custom saved model {doc_id}")
    #         return True
    #     except Exception as e:
    #         logger.error(f"❌ Custom save failed for {doc_id}: {e}")
    #         return False
    
    # Create server with default functions (or pass custom ones)
    server = LoroWebSocketServer(
        port=8081,
        load_model=default_load_model,
        save_model=default_save_model,
        autosave_interval_sec=60
    )
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("🛑 Received KeyboardInterrupt, shutting down...")
        await server.shutdown()
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
        await server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Received KeyboardInterrupt, shutting down...")
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        sys.exit(1)
    
    logger.info("🛑 Server stopped by user")
    sys.exit(0)
