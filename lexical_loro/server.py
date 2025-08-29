#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Loro WebSocket server for real-time collaboration using loro-py
"""

import asyncio
import hashlib
import json
import logging
import random
import string
import sys
import time
import traceback
from typing import Dict, Set, Any
import websockets
from websockets.legacy.server import WebSocketServerProtocol
from loro import LoroDoc, ExportMode, EphemeralStore, EphemeralStoreEvent
from .model.lexical_model import LexicalModel


INITIAL_LEXICAL_JSON = """
{"editorState":{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}},"lastSaved":1755694807576,"source":"Lexical Loro","version":"0.34.0"}
"""

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class Client:
    def __init__(self, websocket: WebSocketServerProtocol, client_id: str):
        self.websocket = websocket
        self.id = client_id
        self.cursor_position = None  # Store cursor position
        self.selection = None  # Store text selection
        self.color = self._generate_color()  # Assign a unique color
        
    def _generate_color(self):
        """Generate a unique color for this client"""
        # Generate a color based on client ID hash
        import hashlib
        hash_val = int(hashlib.md5(self.id.encode()).hexdigest()[:6], 16)
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
            '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
            '#C44569', '#F8B500', '#6C5CE7', '#A29BFE', '#FD79A8'
        ]
        return colors[hash_val % len(colors)]


class LoroWebSocketServer:
    def __init__(self, port: int = 8081):
        self.port = port
        self.clients: Dict[str, Client] = {}
        self.loro_docs: Dict[str, LoroDoc] = {}  # Store Loro documents by docId
        self.loro_models: Dict[str, LexicalModel] = {}  # Store LoroModel instances by docId
        self.ephemeral_stores: Dict[str, EphemeralStore] = {}  # Store EphemeralStore instances by docId
        self.ephemeral_subscriptions: Dict[str, Any] = {}  # Store ephemeral subscriptions by docId
        self.running = False
        
        # Initialize default documents and ephemeral stores
        self._initialize_documents()
    
    def get_loro_model(self, doc_id: str) -> LexicalModel:
        """
        Get or create a LexicalModel for the given document ID.
        This method enables server simplification by providing a unified interface.
        Step 3: Now includes ephemeral_timeout parameter for integrated ephemeral management.
        """
        if doc_id not in self.loro_models:
            # Get or create the underlying LoroDoc
            if doc_id not in self.loro_docs:
                new_doc = LoroDoc()
                text_container = new_doc.get_text(doc_id)
                self.loro_docs[doc_id] = new_doc
                logger.info(f"📄 Created new LoroDoc for {doc_id}")
            
            # Create LexicalModel using Step 1 methods with Step 3 ephemeral support
            model = LexicalModel.create_document(
                doc_id=doc_id,
                change_callback=self._on_loro_model_change,
                ephemeral_timeout=300000,  # Step 3: 5 minutes ephemeral timeout
                loro_doc=self.loro_docs[doc_id]  # Use existing LoroDoc
            )
            self.loro_models[doc_id] = model
            logger.info(f"🧠 Created LexicalModel with integrated EphemeralStore for {doc_id}")
        
        return self.loro_models[doc_id]

    def _on_loro_model_change(self, loro_model):
        """Callback when a LoroModel changes via subscription"""
        try:
            # Log the change
            logger.info(f"📄 LoroModel changed: {repr(loro_model)}")
            
            # Additional server-side handling can be added here if needed
            # For now, the LoroModel's subscription mechanism handles most of the work
            
        except Exception as e:
            logger.error(f"❌ Error in LoroModel change callback: {e}")
        
    def _initialize_documents(self):
        """Initialize default Loro documents and EphemeralStores"""
        # Create documents for the known doc types
        for doc_id in ['shared-text', 'lexical-shared-doc']:
            doc = LoroDoc()
            ephemeral_store = EphemeralStore(300000)  # 5 minutes timeout
            
            try:
                # Always use the doc_id as the text container name to match JavaScript behavior
                # JavaScript uses: doc.getText(docId) 
                # Python uses: doc.get_text(doc_id)
                text_container = doc.get_text(doc_id)
                
                # Seed initial content for the Lexical document if it's empty
                if doc_id == 'lexical-shared-doc':
                    try:
                        existing = text_container.to_string()
                    except Exception:
                        existing = ''
                    if not existing:
                        # Provided initial Lexical JSON content (server-owned initial state)
                        initial_lexical_json = INITIAL_LEXICAL_JSON
                        try:
                            text_container.insert(0, initial_lexical_json)
                            doc.commit()
                            logger.info("🧩 Seeded initial Lexical JSON into 'lexical-shared-doc'")
                        except Exception as seed_error:
                            logger.error(f"❌ Failed to seed initial content for {doc_id}: {seed_error}")
                
                # Commit any changes to make the document valid
                doc.commit()
                    
                self.loro_docs[doc_id] = doc
                
                # Create LoroModel from the loro_doc for lexical documents with Step 3 ephemeral support
                loro_model = LexicalModel(text_doc=doc, container_id=doc_id, change_callback=self._on_loro_model_change, ephemeral_timeout=300000)
                self.loro_models[doc_id] = loro_model
                logger.info(f"🧠 Created LoroModel with integrated EphemeralStore for: {doc_id}")
                
                self.ephemeral_stores[doc_id] = ephemeral_store
                
                # Subscribe to ephemeral store events for this document
                subscription = ephemeral_store.subscribe(
                    lambda event: self._handle_ephemeral_event(doc_id, event) or True
                )
                self.ephemeral_subscriptions[doc_id] = subscription
                
                logger.info(f"📄 Initialized Loro document and EphemeralStore with event subscription: {doc_id}")
                logger.info(f"📋 Text container name for {doc_id}: '{doc_id}' (matches JavaScript docId)")
            except Exception as e:
                logger.error(f"❌ Failed to initialize document {doc_id}: {e}")
                # Still create an empty document and ephemeral store as fallback
                fallback_doc = LoroDoc()
                self.loro_docs[doc_id] = fallback_doc
                
                # Create LoroModel for lexical documents even in fallback
                if doc_id == 'lexical-shared-doc':
                    loro_model = LexicalModel(text_doc=fallback_doc, container_id=doc_id, change_callback=self._on_loro_model_change)
                    self.loro_models[doc_id] = loro_model
                    logger.info(f"🧠 Created fallback LoroModel for: {doc_id}")
                
                self.ephemeral_stores[doc_id] = EphemeralStore(300000)  # 5 minutes timeout
    
    def _extract_event_data(self, event: EphemeralStoreEvent) -> dict:
        """Extract event data safely from EphemeralStoreEvent"""
        try:
            return {
                "by": str(event.by) if event.by is not None else "unknown",
                "added": list(event.added) if event.added else [],
                "updated": list(event.updated) if event.updated else [],
                "removed": list(event.removed) if event.removed else []
            }
        except Exception as e:
            logger.error(f"❌ Error extracting event data: {e}")
            return {
                "by": "error",
                "added": [],
                "updated": [],
                "removed": []
            }

    def _handle_ephemeral_event(self, doc_id: str, event: EphemeralStoreEvent):
        """Handle ephemeral store events and broadcast to clients"""
        try:
            # Extract event data safely
            event_data = self._extract_event_data(event)
            
            # Log the ephemeral event
            logger.info(f"👁️  Ephemeral event for {doc_id}: by={event_data['by']}, "
                       f"added={len(event_data['added'])}, updated={len(event_data['updated'])}, "
                       f"removed={len(event_data['removed'])}")
            
            # Log LoroModel state for lexical documents during ephemeral events
            if doc_id in self.loro_models:
                loro_model = self.loro_models[doc_id]
                logger.info(f"👁️  Using LoroModel instance {id(loro_model)} for {doc_id}")
                # LoroModel will handle syncing via its subscription mechanism
                logger.info(f"👁️  LoroModel state during ephemeral event: {repr(loro_model)}")
            
            # Only broadcast if there are actual changes
            if event_data['added'] or event_data['updated'] or event_data['removed']:
                # Create broadcast message with event info
                message = {
                    "type": "ephemeral-event",
                    "docId": doc_id,
                    "event": event_data
                }
                
                # Schedule deferred broadcast to avoid "Already mutably borrowed" error
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # Use call_soon to defer the broadcast operation
                        loop.call_soon(self._schedule_ephemeral_broadcast, doc_id, message)
                    else:
                        logger.warning("Event loop not running, skipping ephemeral broadcast")
                except Exception as broadcast_error:
                    logger.error(f"❌ Error scheduling ephemeral broadcast: {broadcast_error}")
            
            return True  # Return True to continue subscription
                
        except Exception as e:
            logger.error(f"❌ Error handling ephemeral event for {doc_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return True  # Return True to continue subscription even on error
    
    def _schedule_ephemeral_broadcast(self, doc_id: str, message: dict):
        """Schedule ephemeral broadcast in a deferred manner"""
        try:
            # Now we can safely encode the ephemeral store
            ephemeral_data = self.ephemeral_stores[doc_id].encode_all()
            message["data"] = ephemeral_data.hex()
            
            # Create the actual broadcast task
            loop = asyncio.get_event_loop()
            asyncio.create_task(self._broadcast_ephemeral_event(message))
            
        except Exception as e:
            logger.error(f"❌ Error in deferred ephemeral broadcast for {doc_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    async def _broadcast_ephemeral_event(self, message):
        """Broadcast ephemeral event to all connected clients"""
        if not self.clients:
            return
            
        # Send to all clients
        for client_id, client in list(self.clients.items()):
            try:
                await client.websocket.send(json.dumps(message))
            except Exception as e:
                logger.error(f"❌ Error sending ephemeral event to client {client_id}: {e}")
                # Client may have disconnected, remove them
                if client_id in self.clients:
                    del self.clients[client_id]
        
    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Loro WebSocket server starting on port {self.port}")
        
        self.running = True
        
        # Start the WebSocket server
        async with websockets.serve(
            self.handle_client,
            "localhost",
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info(f"✅ Loro WebSocket server is running on ws://localhost:{self.port}")
            
            # Start stats logging task
            stats_task = asyncio.create_task(self.log_stats())
            
            try:
                # Keep the server running until interrupted
                while self.running:
                    await asyncio.sleep(1)
            except (KeyboardInterrupt, asyncio.CancelledError):
                logger.info("🛑 Server shutdown requested")
            finally:
                self.running = False
                stats_task.cancel()
                try:
                    await stats_task
                except asyncio.CancelledError:
                    pass
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a new client connection"""
        client_id = self.generate_client_id()
        client = Client(websocket, client_id)
        
        self.clients[client_id] = client
        logger.info(f"📱 Client {client_id} connected. Total clients: {len(self.clients)}")
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "welcome",
                "clientId": client_id,
                "color": client.color,
                "message": "Connected to Loro CRDT server (Python)"
            }))
            
            # Send current document snapshots to the new client if available
            await self.send_initial_snapshots(websocket, client_id)
            
            # Listen for messages from this client
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📴 Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_id}: {e}")
        finally:
            # Step 3 Simplified Cleanup: Delegate to LexicalModel for each document
            logger.info(f"🧹 Starting cleanup for disconnected client {client_id}")
            
            # Use LexicalModel delegation for cleanup (Step 3 approach)
            for doc_id in self.loro_models:
                try:
                    model = self.loro_models[doc_id]
                    response = model.handle_client_disconnect(client_id)
                    
                    # Handle the structured response from LexicalModel
                    if response.get("success"):
                        logger.info(f"✅ Client cleanup succeeded for {doc_id}")
                        had_data = response.get("had_data", False)
                        if had_data:
                            logger.info(f"🧹 Removed ephemeral data for client {client_id} in {doc_id}")
                        else:
                            logger.info(f"🔍 No ephemeral data found for client {client_id} in {doc_id}")
                        
                        # Handle broadcast if needed
                        if response.get("broadcast_needed"):
                            broadcast_data = response.get("broadcast_data", {})
                            await self.broadcast_to_other_clients(client_id, broadcast_data)
                            logger.info(f"📡 Broadcasted client removal for {client_id} in {doc_id}")
                    else:
                        error_msg = response.get("error", "Unknown error")
                        logger.error(f"❌ Client cleanup failed for {doc_id}: {error_msg}")
                        
                except Exception as e:
                    logger.error(f"❌ Error during model cleanup for {client_id} in {doc_id}: {e}")
            
            # Remove client from main client list
            if client_id in self.clients:
                del self.clients[client_id]
            
            logger.info(f"📴 Client {client_id} removed. Total clients: {len(self.clients)}")
    
    async def send_initial_snapshots(self, websocket: WebSocketServerProtocol, client_id: str):
        """Send initial snapshots for known document types"""
        for doc_id, doc in self.loro_docs.items():
            try:
                # Export the current state as bytes using the correct API
                snapshot = doc.export(ExportMode.Snapshot())
                
                if snapshot and len(snapshot) > 0:
                    await websocket.send(json.dumps({
                        "type": "initial-snapshot",
                        "snapshot": list(snapshot),  # Convert bytes to list of integers
                        "docId": doc_id
                    }))
                    logger.info(f"📄 Sent {doc_id} snapshot ({len(snapshot)} bytes) to client {client_id}")
                else:
                    logger.info(f"📄 No content in {doc_id} to send to client {client_id}")
            except Exception as e:
                logger.error(f"❌ Error sending snapshot for {doc_id} to {client_id}: {e}")
    
    async def handle_message(self, client_id: str, message: str):
        """
        Handle a message from a client - NOW USING STEP 3 SIMPLIFIED APPROACH
        
        This method now delegates to LexicalModel for both document and ephemeral operations.
        The complex manual Loro handling has been replaced with clean delegation.
        """
        try:
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId", "shared-text")
            
            logger.info(f"📨 {message_type} for {doc_id} from {client_id}")
            
            # Define Loro-related message types that LexicalModel can handle (Steps 1&2)
            loro_message_types = ["loro-update", "snapshot", "request-snapshot", "append-paragraph"]
            
            # Define ephemeral message types that LexicalModel can handle (Step 3)
            ephemeral_message_types = ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]
            
            if message_type in loro_message_types:
                # Use LexicalModel.handle_message() - Steps 1&2 feature!
                model = self.get_loro_model(doc_id)
                response = model.handle_message(message_type, data, client_id)
                
                # Handle the structured response from LexicalModel
                await self._handle_model_response(response, client_id, doc_id)
                
            elif message_type in ephemeral_message_types:
                # Use LexicalModel.handle_ephemeral_message() - Step 3 feature!
                model = self.get_loro_model(doc_id)
                
                # Add client color to data for ephemeral messages
                client = self.clients.get(client_id)
                if client and "color" not in data:
                    data["color"] = client.color
                
                response = model.handle_ephemeral_message(message_type, data, client_id)
                
                # Handle the structured response from LexicalModel
                await self._handle_model_response(response, client_id, doc_id)
                
            else:
                logger.warning(f"❓ Unknown message type: {message_type}")
                await self._send_error_to_client(client_id, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error(f"❌ Invalid JSON from client {client_id}")
            await self._send_error_to_client(client_id, "Invalid message format")
        except Exception as e:
            logger.error(f"❌ Error processing message from client {client_id}: {e}")
            await self._send_error_to_client(client_id, f"Server error: {str(e)}")
    
    async def _handle_model_response(self, response: Dict[str, Any], client_id: str, doc_id: str):
        """Handle structured response from LexicalModel methods"""
        message_type = response.get("message_type", "unknown")
        
        if not response.get("success"):
            # Handle error response
            error_msg = response.get("error", "Unknown error")
            logger.error(f"❌ {message_type} failed: {error_msg}")
            await self._send_error_to_client(client_id, f"{message_type} failed: {error_msg}")
            return
        
        # Handle successful response
        logger.info(f"✅ {message_type} succeeded for {doc_id}")
        
        # Handle broadcast needs
        if response.get("broadcast_needed"):
            broadcast_data = response.get("broadcast_data", {})
            await self.broadcast_to_other_clients(client_id, broadcast_data)
            logger.info(f"📡 Broadcasted {message_type} to {len(self.clients) - 1} other clients")
        
        # Handle direct response needs
        if response.get("response_needed"):
            response_data = response.get("response_data", {})
            client = self.clients.get(client_id)
            if client:
                try:
                    await client.websocket.send(json.dumps(response_data))
                    logger.info(f"📤 Sent {response_data.get('type', 'response')} to {client_id}")
                except Exception as e:
                    logger.error(f"❌ Failed to send response to {client_id}: {e}")
        
        # Log document state changes
        if response.get("document_info"):
            doc_info = response["document_info"]
            logger.info(f"📋 {doc_id}: {doc_info.get('lexical_blocks', 0)} blocks, {doc_info.get('content_length', 0)} chars")
    
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
    
    # ==========================================
    # LEGACY COMPLEX MESSAGE HANDLING (DEPRECATED)
    # ==========================================
    
    async def handle_message_legacy(self, client_id: str, message: str):
        """Handle a message from a client"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "loro-update":
                # Apply the update to our local Loro document and broadcast
                doc_id = data.get("docId", "shared-text")
                update_data = data.get("update", [])
                
                if doc_id in self.loro_docs and update_data:
                    try:
                        # Import the update into our Loro document
                        update_bytes = bytes(update_data)
                        self.loro_docs[doc_id].import_(update_bytes)
                        logger.info(f"📝 Applied Loro update for {doc_id} from client {client_id}")
                        
                        # Log the current document content to see what's stored
                        try:
                            text_container = self.loro_docs[doc_id].get_text(doc_id)
                            current_content = text_container.to_string()  # Use to_string() method
                            logger.info(f"📋 Current {doc_id} content after update: {json.dumps(current_content)} (length: {len(current_content)})")
                            
                            # Log the lexical_model structure for lexical documents
                            if doc_id in self.loro_models:
                                loro_model = self.loro_models[doc_id]
                                
                                logger.info(f"🧠 Using LoroModel instance {id(loro_model)} for {doc_id}")
                                # Debug: Check if LoroModel is using the same LoroDoc reference
                                logger.info(f"🔍 Debug: server LoroDoc id: {id(self.loro_docs[doc_id])}")
                                logger.info(f"🔍 Debug: LoroModel LoroDoc id: {id(loro_model.text_doc)}")
                                logger.info(f"🔍 Debug: LoroDoc references match: {self.loro_docs[doc_id] is loro_model.text_doc}")
                                
                                # LoroModel will handle syncing via its subscription mechanism
                                logger.info(f"🧠 LoroModel for {doc_id}: {loro_model}")
                                logger.info(f"🧠 LoroModel detailed: {repr(loro_model)}")
                            
                            # Try to parse as JSON to see if it's Lexical EditorState
                            try:
                                if current_content.strip():
                                    parsed_content = json.loads(current_content)
                                    logger.info(f"📋 Parsed {doc_id} as JSON - Lexical EditorState structure:")
                                    logger.info(f"📋   Root type: {parsed_content.get('root', {}).get('type', 'unknown')}")
                                    
                                    root_children = parsed_content.get('root', {}).get('children', [])
                                    logger.info(f"📋   Root children count: {len(root_children)}")
                                    
                                    for i, child in enumerate(root_children[:3]):  # Show first 3 children
                                        child_type = child.get('type', 'unknown')
                                        child_text = child.get('text', '')
                                        child_children = child.get('children', [])
                                        logger.info(f"📋   Child {i}: type='{child_type}', text='{child_text[:50]}...', children={len(child_children)}")
                                    
                                    if len(root_children) > 3:
                                        logger.info(f"📋   ... and {len(root_children) - 3} more children")
                                        
                            except json.JSONDecodeError:
                                logger.info(f"📋 Content is not valid JSON - might be plain text or HTML")
                            
                            # Log the full document structure as JSON
                            try:
                                # Also try getting the document as a dictionary/object
                                doc_state = self.loro_docs[doc_id].get_deep_value()
                                logger.info(f"📋 Full {doc_id} document structure: {json.dumps(doc_state, indent=2, default=str)}")
                                
                                # Log container information
                                containers = []
                                # Try to iterate through all containers in the document
                                try:
                                    # Get all text containers
                                    if hasattr(self.loro_docs[doc_id], 'get_all_containers'):
                                        all_containers = self.loro_docs[doc_id].get_all_containers()
                                        for container_info in all_containers:
                                            containers.append(str(container_info))
                                    else:
                                        # Fallback - just show the known text container
                                        containers.append(f"text:{doc_id}")
                                except Exception as container_error:
                                    logger.info(f"📋 Could not enumerate containers: {container_error}")
                                    containers.append(f"text:{doc_id} (known)")
                                
                                logger.info(f"📋 {doc_id} containers: {containers}")
                                
                            except Exception as json_error:
                                logger.info(f"📋 Could not export JSON structure: {json_error}")
                                # Fallback to showing what we can
                                try:
                                    doc_info = {
                                        "text_containers": {doc_id: current_content},
                                        "content_length": len(current_content),
                                        "container_name": doc_id,
                                        "content_type": "lexical_json" if current_content.strip().startswith('{') else "other"
                                    }
                                    logger.info(f"📋 {doc_id} basic structure: {json.dumps(doc_info, indent=2)}")
                                except Exception as fallback_error:
                                    logger.error(f"❌ Could not log document structure: {fallback_error}")
                                    
                        except Exception as content_error:
                            logger.error(f"❌ Error reading document content: {content_error}")
                        
                        # Broadcast the update to all other clients
                        await self.broadcast_to_other_clients(client_id, data)
                        logger.info(f"🔄 Broadcasting Loro update from client {client_id} to {len(self.clients) - 1} other clients")
                    except Exception as e:
                        logger.error(f"❌ Error applying Loro update for {doc_id}: {e}")
                
            elif message_type == "snapshot":
                # Update our Loro document with the snapshot
                doc_id = data.get("docId", "shared-text")
                snapshot_data = data.get("snapshot", [])
                
                if snapshot_data:
                    try:
                        snapshot_bytes = bytes(snapshot_data)
                        if doc_id not in self.loro_docs:
                            new_doc = LoroDoc()
                            self.loro_docs[doc_id] = new_doc
                            
                            # Create LoroModel for lexical documents
                            if 'lexical' in doc_id.lower():
                                loro_model = LexicalModel(text_doc=new_doc, container_id=doc_id, change_callback=self._on_loro_model_change)
                                self.loro_models[doc_id] = loro_model
                                logger.info(f"🧠 Created LoroModel for new document: {doc_id}")
                        
                        # Import the snapshot
                        self.loro_docs[doc_id].import_(snapshot_bytes)
                        logger.info(f"📄 Updated Loro document {doc_id} from snapshot ({len(snapshot_bytes)} bytes) from client {client_id}")
                        
                        # Log the current document content after snapshot import
                        try:
                            text_container = self.loro_docs[doc_id].get_text(doc_id)
                            current_content = text_container.to_string()  # Use to_string() method
                            logger.info(f"📋 Current {doc_id} content after snapshot: {json.dumps(current_content)} (length: {len(current_content)})")
                            
                            # Log the full document structure as JSON after snapshot
                            try:
                                doc_state = self.loro_docs[doc_id].get_deep_value()
                                logger.info(f"📋 Full {doc_id} document structure after snapshot: {json.dumps(doc_state, indent=2, default=str)}")
                            except Exception as json_error:
                                logger.info(f"📋 Could not export JSON structure after snapshot: {json_error}")
                                
                        except Exception as content_error:
                            logger.error(f"❌ Error reading document content after snapshot: {content_error}")
                    except Exception as e:
                        logger.error(f"❌ Error importing snapshot for {doc_id}: {e}")
                
            elif message_type == "request-snapshot":
                # Client is requesting the current snapshot for a specific document
                doc_id = data.get("docId", "shared-text")
                
                client = self.clients.get(client_id)
                if not client:
                    return
                
                if doc_id in self.loro_docs:
                    try:
                        # Log the current document content before exporting
                        try:
                            text_container = self.loro_docs[doc_id].get_text(doc_id)
                            current_content = text_container.to_string()  # Use to_string() method
                            logger.info(f"📋 {doc_id} content before export: {json.dumps(current_content)} (length: {len(current_content)})")
                            
                            # Log the full document structure before export
                            try:
                                doc_state = self.loro_docs[doc_id].get_deep_value()
                                logger.info(f"📋 Full {doc_id} document structure before export: {json.dumps(doc_state, indent=2, default=str)}")
                            except Exception as json_error:
                                logger.info(f"📋 Could not export JSON structure before export: {json_error}")
                                
                        except Exception as content_error:
                            logger.error(f"❌ Error reading document content before export: {content_error}")
                        
                        # Export the current state using the correct API
                        snapshot = self.loro_docs[doc_id].export(ExportMode.Snapshot())
                        
                        if snapshot and len(snapshot) > 0:
                            await client.websocket.send(json.dumps({
                                "type": "initial-snapshot",
                                "snapshot": list(snapshot),
                                "docId": doc_id
                            }))
                            logger.info(f"📄 Sent requested snapshot for {doc_id} ({len(snapshot)} bytes) to client {client_id}")
                        else:
                            logger.info(f"📄 No content in {doc_id} to send to client {client_id}")
                    except Exception as e:
                        logger.error(f"❌ Error exporting snapshot for {doc_id}: {e}")
                else:
                    # Document doesn't exist, ask other clients to provide one
                    await self.broadcast_to_other_clients(client_id, {
                        "type": "snapshot-request",
                        "requesterId": client_id,
                        "docId": doc_id
                    })
                    logger.info(f"📞 Requesting snapshot for {doc_id} from other clients for {client_id}")
            
            elif message_type == "ephemeral-update":
                # Handle ephemeral updates (cursor positions, selections) using EphemeralStore
                doc_id = data.get("docId", "shared-text")
                ephemeral_data = data.get("data")
                
                if doc_id in self.ephemeral_stores and ephemeral_data:
                    try:
                        # Convert hex string back to bytes
                        ephemeral_bytes = bytes.fromhex(ephemeral_data)
                        
                        # Apply the ephemeral data to our store
                        # This will trigger the subscription callback automatically
                        self.ephemeral_stores[doc_id].apply(ephemeral_bytes)
                        
                        # Note: No manual broadcasting needed - the subscription will handle it
                        logger.info(f"👁️  Applied ephemeral update from client {client_id}")
                        
                        # Log LoroModel state after ephemeral update for lexical documents
                        if doc_id in self.loro_models:
                            loro_model = self.loro_models[doc_id]
                            # LoroModel will handle syncing via its subscription mechanism
                            logger.info(f"👁️  LoroModel after ephemeral update: {repr(loro_model)}")
                    except Exception as e:
                        logger.error(f"❌ Error processing ephemeral update for {doc_id}: {e}")
            
            elif message_type == "ephemeral":
                # Handle direct ephemeral data from Loro client (new format)
                doc_id = data.get("docId", "lexical-shared-doc")
                ephemeral_data = data.get("data")
                
                if doc_id in self.ephemeral_stores and ephemeral_data:
                    try:
                        # Convert array of integers back to bytes
                        if isinstance(ephemeral_data, list):
                            ephemeral_bytes = bytes(ephemeral_data)
                        else:
                            # Fallback for hex string format
                            ephemeral_bytes = bytes.fromhex(ephemeral_data)
                        
                        # Apply the ephemeral data to our store
                        # This will trigger the subscription callback automatically
                        self.ephemeral_stores[doc_id].apply(ephemeral_bytes)
                        
                        logger.info(f"👁️  Applied ephemeral data from client {client_id}")
                        
                        # Log LoroModel state after ephemeral update for lexical documents
                        if doc_id in self.loro_models:
                            loro_model = self.loro_models[doc_id]
                            # LoroModel will handle syncing via its subscription mechanism
                            logger.info(f"👁️  LoroModel after ephemeral data: {repr(loro_model)}")
                    except Exception as e:
                        logger.error(f"❌ Error processing ephemeral data for {doc_id}: {e}")
            
            elif message_type == "awareness-update":
                # Handle legacy awareness updates by converting to ephemeral store
                doc_id = data.get("docId", "shared-text")
                awareness_state = data.get("awarenessState")
                peer_id = data.get("peerId", client_id)
                
                if doc_id in self.ephemeral_stores and awareness_state:
                    try:
                        # Store the awareness state in the ephemeral store
                        # This will trigger the subscription callback automatically
                        self.ephemeral_stores[doc_id].set(peer_id, awareness_state)
                        
                        logger.info(f"👁️  Applied awareness state from client {client_id}")
                    except Exception as e:
                        logger.error(f"❌ Error processing awareness update for {doc_id}: {e}")
            
            elif message_type == "cursor-position":
                # Handle cursor position updates using EphemeralStore
                doc_id = data.get("docId", "shared-text")
                position = data.get("position")
                
                if doc_id in self.ephemeral_stores and position is not None:
                    client = self.clients.get(client_id)
                    if client:
                        cursor_data = {
                            "clientId": client_id,
                            "position": position,
                            "color": client.color,
                            "timestamp": time.time()
                        }
                        
                        # Store in ephemeral store
                        self.ephemeral_stores[doc_id].set(f"cursor_{client_id}", cursor_data)
                        
                        # Broadcast ephemeral update
                        ephemeral_data = self.ephemeral_stores[doc_id].encode_all()
                        await self.broadcast_to_other_clients(client_id, {
                            "type": "ephemeral-update",
                            "docId": doc_id,
                            "data": ephemeral_data.hex()
                        })
                        logger.info(f"🖱️ Updated cursor position for client {client_id} in {doc_id}: {position}")
            
            elif message_type == "text-selection":
                # Handle text selection updates using EphemeralStore
                doc_id = data.get("docId", "shared-text")
                selection = data.get("selection")
                
                client = self.clients.get(client_id)
                if client and doc_id in self.ephemeral_stores:
                    selection_data = {
                        "clientId": client_id,
                        "selection": selection,
                        "color": client.color,
                        "timestamp": time.time()
                    }
                    
                    # Store in ephemeral store
                    self.ephemeral_stores[doc_id].set(f"selection_{client_id}", selection_data)
                    
                    # Broadcast ephemeral update
                    ephemeral_data = self.ephemeral_stores[doc_id].encode_all()
                    await self.broadcast_to_other_clients(client_id, {
                        "type": "ephemeral-update",
                        "docId": doc_id,
                        "data": ephemeral_data.hex()
                    })
                    logger.info(f"📝 Updated text selection for client {client_id} in {doc_id}: {selection}")
            
            elif message_type == "append-paragraph":
                # Handle append-paragraph command - add a new paragraph to the LoroModel
                doc_id = data.get("docId", "lexical-shared-doc")
                message_text = data.get("message", "Hello")
                
                logger.info(f"➕ Received append-paragraph command for {doc_id} from client {client_id}: '{message_text}'")
                
                # Get the LoroModel for this document
                if doc_id in self.loro_models:
                    loro_model = self.loro_models[doc_id]
                    
                    # Create a new paragraph block
                    new_paragraph = {
                        "children": [{
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "text": message_text,
                            "type": "text",
                            "version": 1
                        }],
                        "direction": "ltr",
                        "format": "",
                        "indent": 0,
                        "type": "paragraph",
                        "version": 1,
                        "textFormat": 0,
                        "textStyle": ""
                    }
                    
                    # LoroModel will handle syncing via its subscription mechanism
                    logger.info(f"🔄 Syncing LoroModel before append: {repr(loro_model)}")
                    
                    # Add the paragraph using LoroModel's method
                    try:
                        logger.info(f"➕ Adding paragraph '{message_text}' to LoroModel with {len(loro_model.lexical_data.get('root', {}).get('children', []))} existing blocks")
                        loro_model.add_block(new_paragraph, "paragraph")
                        logger.info(f"✅ Added paragraph to {doc_id}: '{message_text}'")
                        logger.info(f"🧠 LoroModel after append: {repr(loro_model)}")
                        
                        # LoroModel will handle syncing via its subscription mechanism
                        logger.info(f"🔄 Final LoroModel state after sync: {repr(loro_model)}")
                        
                        # Broadcast the update to all clients
                        await self.broadcast_to_all_clients({
                            "type": "paragraph-added",
                            "docId": doc_id,
                            "message": message_text,
                            "addedBy": client_id
                        })
                    except Exception as add_error:
                        logger.error(f"❌ Failed to add paragraph to {doc_id}: {add_error}")
                        logger.error(f"❌ LoroModel state: {repr(loro_model)}")
                        # The LoroModel subscription should handle recovery automatically
                        logger.info(f"🔄 LoroModel auto-recovery via subscription for {doc_id}")
                else:
                    logger.warning(f"⚠️ No LoroModel found for document {doc_id}")
                    
        except json.JSONDecodeError:
            logger.error(f"❌ Invalid JSON from client {client_id}")
            client = self.clients.get(client_id)
            if client:
                await client.websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid message format"
                }))
        except Exception as e:
            logger.error(f"❌ Error processing message from client {client_id}: {e}")
    
    async def broadcast_to_other_clients(self, sender_id: str, message: dict):
        """Broadcast a message to all clients except the sender"""
        if len(self.clients) <= 1:
            return
            
        message_str = json.dumps(message)
        failed_clients = []
        
        for client_id, client in self.clients.items():
            if client_id != sender_id:
                try:
                    await client.websocket.send(message_str)
                except (websockets.exceptions.ConnectionClosed, Exception) as e:
                    logger.error(f"❌ Error sending message to client {client_id}: {e}")
                    failed_clients.append(client_id)
        
        # Remove failed clients
        for client_id in failed_clients:
            if client_id in self.clients:
                del self.clients[client_id]
    
    async def broadcast_to_all_clients(self, message: dict):
        """Broadcast a message to all connected clients"""
        if len(self.clients) == 0:
            return
            
        message_str = json.dumps(message)
        failed_clients = []
        
        for client_id, client in self.clients.items():
            try:
                await client.websocket.send(message_str)
            except (websockets.exceptions.ConnectionClosed, Exception) as e:
                logger.error(f"❌ Error sending message to client {client_id}: {e}")
                failed_clients.append(client_id)
        
        # Remove failed clients
        for client_id in failed_clients:
            if client_id in self.clients:
                del self.clients[client_id]
    
    def generate_client_id(self) -> str:
        """Generate a unique client ID"""
        timestamp = int(time.time() * 1000)
        import random
        import string
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        return f"py_client_{timestamp}_{suffix}"
    
    def get_loro_model(self, doc_id: str) -> LexicalModel:
        """Get LoroModel for a document ID, creating one if it doesn't exist"""
        if doc_id not in self.loro_models:
            if doc_id in self.loro_docs:
                # Create model from existing document, passing the doc_id as container_id
                loro_model = LexicalModel(text_doc=self.loro_docs[doc_id], container_id=doc_id, change_callback=self._on_loro_model_change)
                self.loro_models[doc_id] = loro_model
                logger.info(f"🧠 Created LoroModel for existing document: {doc_id}")
            else:
                # Create new document and model
                new_doc = LoroDoc()
                self.loro_docs[doc_id] = new_doc
                loro_model = LexicalModel(text_doc=new_doc, container_id=doc_id, change_callback=self._on_loro_model_change)
                self.loro_models[doc_id] = loro_model
                logger.info(f"🧠 Created new LoroDoc and LoroModel for: {doc_id}")
        
        return self.loro_models[doc_id]
    
    async def log_stats(self):
        """Log server statistics periodically and clean up stale connections"""
        while self.running:
            try:
                await asyncio.sleep(30)  # Check every 30 seconds
                if self.running:
                    # Clean up stale connections
                    stale_clients = []
                    for client_id, client in list(self.clients.items()):
                        try:
                            # Try to ping the client to check if connection is alive
                            if hasattr(client.websocket, 'ping'):
                                await asyncio.wait_for(client.websocket.ping(), timeout=5.0)
                        except (asyncio.TimeoutError, websockets.exceptions.ConnectionClosed, Exception) as e:
                            logger.info(f"🧹 Detected stale connection for client {client_id}: {e}")
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
                            
                            # Clean up ephemeral data for stale client
                            for doc_id in self.ephemeral_stores:
                                try:
                                    ephemeral_store = self.ephemeral_stores[doc_id]
                                    client_state = ephemeral_store.get(client_id)
                                    if client_state is not None:
                                        ephemeral_store.delete(client_id)
                                        # Broadcast removal
                                        await self.broadcast_to_other_clients(client_id, {
                                            "type": "ephemeral-update",
                                            "docId": doc_id,
                                            "data": ephemeral_store.encode_all().hex(),
                                            "event": {
                                                "by": "server-cleanup",
                                                "added": [],
                                                "updated": [],
                                                "removed": [client_id]
                                            }
                                        })
                                except Exception as e:
                                    logger.error(f"❌ Error cleaning up ephemeral data for stale client {client_id}: {e}")
                    
                    # Log stats
                    doc_stats = []
                    for doc_id, doc in self.loro_docs.items():
                        try:
                            # Get snapshot size using the correct API
                            snapshot = doc.export(ExportMode.Snapshot())
                            snapshot_size = len(snapshot) if snapshot else 0
                            model_suffix = "+model" if doc_id in self.loro_models else ""
                            doc_stats.append(f"{doc_id}({snapshot_size}b{model_suffix})")
                        except Exception as e:
                            doc_stats.append(f"{doc_id}(error: {str(e)})")
                    
                    logger.info(f"📊 Server stats: {len(self.clients)} clients, Documents: {', '.join(doc_stats)}, Models: {len(self.loro_models)}")
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Error in stats/cleanup loop: {e}")
    
    async def shutdown(self):
        """Gracefully shutdown the server"""
        logger.info("🛑 Shutting down Loro WebSocket server...")
        self.running = False
        
        # Close all client connections
        clients_to_close = list(self.clients.values())  # Create a copy of the list
        for client in clients_to_close:
            try:
                await client.websocket.close()
            except Exception:
                pass
        
        self.clients.clear()
        self.loro_docs.clear()
        self.loro_models.clear()
        self.ephemeral_stores.clear()
        logger.info("✅ Server shutdown complete")


async def main():
    """Main entry point"""
    server = LoroWebSocketServer(8081)  # Use port 8081 to not conflict with Node.js server
    
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
