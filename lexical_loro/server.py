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
    Default load_model implementation - returns initial content for new models.
    
    Args:
        doc_id: Document ID to load
        
    Returns:
        Initial content string or None for default initialization
    """
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
        
        # Document doesn't exist, load initial content and create it
        initial_content = self.load_model(doc_id)
        return self.document_manager.get_or_create_document(doc_id, initial_content)

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
            if event_type in ["ephemeral_changed", "broadcast_needed"]:
                # Schedule async broadcasting
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
            broadcast_data = event_data.get("broadcast_data")
            client_id = event_data.get("client_id")
            
            if broadcast_data and client_id:
                await self.broadcast_to_other_clients(client_id, broadcast_data)
                
        except Exception as e:
            logger.error(f"❌ Error in broadcast handling: {e}")
    
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
                        for doc_id in doc_ids:
                            try:
                                # Get existing model without triggering load (model already exists)
                                if doc_id in self.document_manager.models:
                                    model = self.document_manager.models[doc_id]
                                    success = self.save_model(doc_id, model)
                                    if success:
                                        logger.info(f"💾 Auto-saved document: {doc_id}")
                                    else:
                                        logger.warning(f"⚠️ Auto-save failed for document: {doc_id}")
                                else:
                                    logger.warning(f"⚠️ Document {doc_id} not found during auto-save")
                            except Exception as e:
                                logger.error(f"❌ Error auto-saving document {doc_id}: {e}")
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
        
        for doc_id in doc_ids:
            try:
                # Get existing model without triggering load (model already exists)
                if doc_id in self.document_manager.models:
                    model = self.document_manager.models[doc_id]
                    success = self.save_model(doc_id, model)
                    results[doc_id] = success
                    
                    if success:
                        logger.info(f"💾 Manually saved document: {doc_id}")
                    else:
                        logger.warning(f"⚠️ Failed to save document: {doc_id}")
                else:
                    logger.warning(f"⚠️ Document {doc_id} not found during manual save")
                    results[doc_id] = False
                    
            except Exception as e:
                logger.error(f"❌ Error saving document {doc_id}: {e}")
                results[doc_id] = False
        
        return results
    
    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Loro WebSocket relay starting on {self.host}:{self.port}")
        
        self.running = True
        
        # Start the WebSocket server
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info(f"✅ Loro WebSocket relay running on ws://{self.host}:{self.port}")
            
            # Start background tasks
            stats_task = asyncio.create_task(self.log_stats())
            self._autosave_task = asyncio.create_task(self._autosave_models())
            
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
        
        try:
            # Extract document ID from WebSocket request
            doc_id = self._extract_doc_id_from_websocket(websocket)
        except ValueError as e:
            # Send error message and close connection if no document ID found
            logger.error(f"❌ Client {client_id} connection rejected: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e),
                "code": "MISSING_DOCUMENT_ID"
            }))
            await websocket.close()
            return
        
        self.clients[client_id] = client
        logger.info(f"📱 Client {client_id} connected for document '{doc_id}'. Total clients: {len(self.clients)}")
        
        try:
            # Send welcome message with document info
            await websocket.send(json.dumps({
                "type": "welcome",
                "clientId": client_id,
                "color": client.color,
                "docId": doc_id,
                "message": "Connected to Loro CRDT relay (Python)"
            }))
            
            # Send initial snapshots to the new client for the specific document
            await self.send_initial_snapshots(websocket, client_id, doc_id)
            
            # Listen for messages from this client
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📴 Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_id}: {e}")
        finally:
            # Delegate client cleanup to DocumentManager
            logger.info(f"🧹 Cleaning up client {client_id}")
            
            # Clean up client data in all managed models
            for doc_id in self.document_manager.list_models():
                try:
                    # Get existing model without triggering load (model already exists)
                    if doc_id in self.document_manager.models:
                        model = self.document_manager.models[doc_id]
                        response = model.handle_client_disconnect(client_id)
                        if response.get("success"):
                            removed_keys = response.get("removed_keys", [])
                            if removed_keys:
                                logger.info(f"🧹 Cleaned up client {client_id} data in {doc_id}")
                except Exception as e:
                    logger.error(f"❌ Error cleaning up client {client_id} in {doc_id}: {e}")
            
            # Remove client from server
            if client_id in self.clients:
                del self.clients[client_id]
            
            logger.info(f"📴 Client {client_id} cleanup complete. Total clients: {len(self.clients)}")
    
    async def send_initial_snapshots(self, websocket: WebSocketServerProtocol, client_id: str, doc_id: str):
        """
        Send initial snapshot for the specified document.
        Create document with initial content and send snapshot.
        """
            
        try:
            # Ensure document exists with initial content
            self.get_document(doc_id)  # This will create with initial content if needed
            
            # Now get the snapshot
            snapshot_bytes = self.document_manager.get_snapshot(doc_id)
            
            if snapshot_bytes and len(snapshot_bytes) > 0:
                # Convert bytes to list of integers for JSON serialization
                snapshot_data = list(snapshot_bytes)
                await websocket.send(json.dumps({
                    "type": "initial-snapshot",
                    "snapshot": snapshot_data,
                    "docId": doc_id,
                    "hasData": True,
                    "hasEvent": True,
                    "hasSnapshot": True,
                    "clientId": client_id,
                    "dataLength": len(snapshot_bytes)
                }))
                logger.info(f"📄 Sent {doc_id} snapshot ({len(snapshot_bytes)} bytes) to client {client_id}")
            else:
                # Send empty response with enhanced fields
                await websocket.send(json.dumps({
                    "type": "initial-snapshot",
                    "docId": doc_id,
                    "hasData": False,
                    "hasEvent": False,
                    "hasSnapshot": False,
                    "clientId": client_id,
                    "dataLength": 0
                }))
                logger.info(f"📄 No content in {doc_id} to send to client {client_id}")
                
        except Exception as e:
            logger.error(f"❌ Error sending snapshot for {doc_id} to {client_id}: {e}")
    
    async def handle_message(self, client_id: str, message: str):
        """
        Handle a message from a client.
        Pure delegation to LexicalModel - server doesn't process messages.
        """
        try:
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId")
            
            # Validate that docId is provided in the message
            if not doc_id:
                raise ValueError(f"Message of type '{message_type}' missing required 'docId' field")
            
            logger.info(f"📨 {message_type} for {doc_id} from {client_id}")
            
            # Add client color to data for better UX
            client = self.clients.get(client_id)
            if client and "color" not in data:
                data["color"] = client.color
            
            # Delegate message handling to DocumentManager
            response = await self.document_manager.handle_message(doc_id, message_type, data, client_id)
            
            # Log LexicalModel state after ephemeral updates
            ephemeral_message_types = ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]
            if message_type in ephemeral_message_types:
                model = self.get_document(doc_id)
                logger.info(f"🔄 LexicalModel after ephemeral update: {repr(model)}")
            
            # Handle the response
            await self._handle_model_response(response, client_id, doc_id)
                
        except json.JSONDecodeError:
            logger.error(f"❌ Invalid JSON from client {client_id}")
            await self._send_error_to_client(client_id, "Invalid message format")
        except Exception as e:
            logger.error(f"❌ Error processing message from client {client_id}: {e}")
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
        if len(self.clients) <= 1:
            return
            
        message_str = json.dumps(message)
        failed_clients = []
        
        # Create a copy of clients to avoid "dictionary changed size during iteration" error
        clients_copy = dict(self.clients)
        
        for client_id, client in clients_copy.items():
            if client_id != sender_id:
                try:
                    # Check if websocket is still valid before sending
                    # For websockets.ServerConnection, check if it's closed instead of open
                    if hasattr(client.websocket, 'closed') and client.websocket.closed:
                        logger.warning(f"⚠️ Skipping send to closed websocket for client {client_id}")
                        failed_clients.append(client_id)
                    else:
                        await client.websocket.send(message_str)
                except (websockets.exceptions.ConnectionClosed, Exception) as e:
                    logger.warning(f"⚠️ Client {client_id} disconnected during broadcast: {e}")
                    failed_clients.append(client_id)
        
        # Remove failed clients safely
        for client_id in failed_clients:
            if client_id in self.clients:
                del self.clients[client_id]
                logger.info(f"🧹 Removed disconnected client {client_id} from broadcast list")
    
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
                    for client_id, client in list(self.clients.items()):
                        try:
                            if hasattr(client.websocket, 'ping'):
                                await asyncio.wait_for(client.websocket.ping(), timeout=5.0)
                        except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed, Exception) as e:
                            logger.info(f"🧹 Detected stale connection for client {client_id}")
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
                    
                    # Log basic stats - Use document manager
                    doc_count = len(self.document_manager.list_models())
                    logger.info(f"📊 Relay stats: {len(self.clients)} clients, {doc_count} models")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Error in stats loop: {e}")
    
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
        for doc_id in doc_ids:
            try:
                # Get existing model without triggering load (model already exists)
                if doc_id in self.document_manager.models:
                    model = self.document_manager.models[doc_id]
                    success = self.save_model(doc_id, model)
                    if success:
                        logger.info(f"💾 Final save completed for model {doc_id}")
                    else:
                        logger.warning(f"⚠️ Final save failed for model {doc_id}")
                else:
                    logger.warning(f"⚠️ Document {doc_id} not found during final save")
            except Exception as e:
                logger.error(f"❌ Error during final save of model {doc_id}: {e}")
        
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
        autosave_interval_sec=5
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
