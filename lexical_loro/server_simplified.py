#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Loro WebSocket server for real-time collaboration using loro-py
Step 4: Simplified server using LexicalModel event system
"""

import asyncio
import hashlib
import json
import logging
import random
import string
import sys
import time
from typing import Dict, Any
import websockets
from websockets.legacy.server import WebSocketServerProtocol
from loro import LoroDoc, ExportMode
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
        self.loro_models: Dict[str, LexicalModel] = {}  # Store LexicalModel instances by docId
        self.running = False
        
        # Initialize default documents
        self._initialize_documents()
    
    def get_loro_model(self, doc_id: str) -> LexicalModel:
        """
        Get or create a LexicalModel for the given document ID.
        Step 4: Simplified using event system - LexicalModel handles everything internally.
        """
        if doc_id not in self.loro_models:
            # Get or create the underlying LoroDoc
            if doc_id not in self.loro_docs:
                new_doc = LoroDoc()
                text_container = new_doc.get_text(doc_id)
                self.loro_docs[doc_id] = new_doc
                logger.info(f"📄 Created new LoroDoc for {doc_id}")
            
            # Create LexicalModel with event system
            model = LexicalModel.create_document(
                doc_id=doc_id,
                event_callback=self._on_lexical_model_event,
                ephemeral_timeout=300000,  # 5 minutes ephemeral timeout
                loro_doc=self.loro_docs[doc_id]  # Use existing LoroDoc
            )
            self.loro_models[doc_id] = model
            logger.info(f"🧠 Created LexicalModel with event system for {doc_id}")
        
        return self.loro_models[doc_id]

    def _on_lexical_model_event(self, event_type: str, event_data: dict):
        """Handle structured events from LexicalModel via the new event system"""
        try:
            # Process events synchronously to avoid concurrent Loro access issues
            # Only schedule async operations for actual network broadcasting
            
            if event_type == "document_changed":
                # Document changes - no async needed
                logger.info(f"📄 Document changed: {event_data.get('container_id', 'unknown')}")
                
            elif event_type == "ephemeral_changed":
                # Ephemeral changes - schedule async broadcasting
                self._schedule_async_broadcast(event_type, event_data)
                
            elif event_type == "broadcast_needed":
                # Broadcast needed - schedule async broadcasting  
                self._schedule_async_broadcast(event_type, event_data)
                
        except Exception as e:
            logger.error(f"❌ Error in event processing: {e}")
    
    def _schedule_async_broadcast(self, event_type: str, event_data: dict):
        """Schedule async broadcasting safely"""
        try:
            import asyncio
            # Get the current event loop and schedule the broadcast
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Schedule for the next iteration of the event loop
                loop.call_soon(lambda: asyncio.create_task(self._process_broadcast_event(event_type, event_data)))
            else:
                logger.warning(f"⚠️ Event loop not running, cannot schedule async broadcast for {event_type}")
        except Exception as e:
            logger.error(f"❌ Error scheduling async broadcast: {e}")
    
    async def _process_broadcast_event(self, event_type: str, event_data: dict):
        """Process broadcasting events asynchronously"""
        try:
            message_type = event_data.get("message_type", "unknown")
            broadcast_data = event_data.get("broadcast_data")
            client_id = event_data.get("client_id")
            
            if event_type == "ephemeral_changed":
                logger.info(f"👁️ Processing ephemeral broadcast: {message_type} from client {client_id}")
                
                # Log the doc_id and get model info for debugging
                doc_id = event_data.get("container_id") or broadcast_data.get("docId") if broadcast_data else "unknown"
                if doc_id != "unknown" and doc_id in self.loro_models:
                    model = self.loro_models[doc_id]
                    logger.info(f"👁️ LexicalModel for ephemeral broadcast: {model}")
                
                if broadcast_data:
                    await self.broadcast_to_other_clients(client_id, broadcast_data)
                    
            elif event_type == "broadcast_needed":
                logger.info(f"📢 Processing broadcast: {message_type} from client {client_id}")
                if broadcast_data:
                    await self.broadcast_to_other_clients(client_id, broadcast_data)
                    
        except Exception as e:
            logger.error(f"❌ Error in broadcast processing: {e}")
    
    def _initialize_documents(self):
        """Initialize default Loro documents - Step 4: Simplified"""
        # Create documents for the known doc types
        for doc_id in ['shared-text', 'lexical-shared-doc']:
            doc = LoroDoc()
            
            try:
                # Always use the doc_id as the text container name to match JavaScript behavior
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
                
                # Create LexicalModel using the event system
                model = LexicalModel(
                    text_doc=doc, 
                    container_id=doc_id, 
                    event_callback=self._on_lexical_model_event, 
                    ephemeral_timeout=300000
                )
                self.loro_models[doc_id] = model
                logger.info(f"🧠 Created LexicalModel with event system for: {doc_id}")
                
                logger.info(f"📄 Initialized Loro document: {doc_id}")
                
            except Exception as e:
                logger.error(f"❌ Failed to initialize document {doc_id}: {e}")
                # Still create an empty document as fallback
                fallback_doc = LoroDoc()
                self.loro_docs[doc_id] = fallback_doc
                
                # Create LexicalModel for lexical documents even in fallback
                if doc_id == 'lexical-shared-doc':
                    model = LexicalModel(
                        text_doc=fallback_doc, 
                        container_id=doc_id, 
                        event_callback=self._on_lexical_model_event
                    )
                    self.loro_models[doc_id] = model
                    logger.info(f"🧠 Created fallback LexicalModel for: {doc_id}")
    
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
            # Step 4: Simplified Cleanup using LexicalModel event system
            logger.info(f"🧹 Starting cleanup for disconnected client {client_id}")
            
            # Use LexicalModel delegation for cleanup
            for doc_id in self.loro_models:
                try:
                    model = self.loro_models[doc_id]
                    response = model.handle_client_disconnect(client_id)
                    
                    # Handle the structured response from LexicalModel
                    if response.get("success"):
                        logger.info(f"✅ Client cleanup succeeded for {doc_id}")
                        removed_keys = response.get("removed_keys", [])
                        if removed_keys:
                            logger.info(f"🧹 Removed ephemeral data for client {client_id} in {doc_id}: {removed_keys}")
                        else:
                            logger.info(f"🔍 No ephemeral data found for client {client_id} in {doc_id}")
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
        Handle a message from a client - Step 4: Simplified using LexicalModel event system
        
        This method delegates to LexicalModel for both document and ephemeral operations.
        """
        try:
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId", "shared-text")
            
            logger.info(f"📨 {message_type} for {doc_id} from {client_id}")
            
            # Define Loro-related message types that LexicalModel can handle
            loro_message_types = ["loro-update", "snapshot", "request-snapshot", "append-paragraph"]
            
            # Define ephemeral message types that LexicalModel can handle
            ephemeral_message_types = ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]
            
            if message_type in loro_message_types:
                # Use LexicalModel.handle_message()
                model = self.get_loro_model(doc_id)
                response = model.handle_message(message_type, data, client_id)
                
                # Handle the structured response from LexicalModel
                await self._handle_model_response(response, client_id, doc_id)
                
            elif message_type in ephemeral_message_types:
                # Use LexicalModel.handle_ephemeral_message()
                model = self.get_loro_model(doc_id)
                
                # Log the LexicalModel details for ephemeral updates
                logger.info(f"👁️ Ephemeral {message_type} - LexicalModel: {model}")
                
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
        """Handle structured response from LexicalModel methods - Step 4 Event System"""
        message_type = response.get("message_type", "unknown")
        
        if not response.get("success"):
            # Handle error response
            error_msg = response.get("error", "Unknown error")
            logger.error(f"❌ {message_type} failed: {error_msg}")
            await self._send_error_to_client(client_id, f"{message_type} failed: {error_msg}")
            return
        
        # Handle successful response
        logger.info(f"✅ {message_type} succeeded for {doc_id}")
        
        # NOTE: Broadcasting is now handled by the event system via _on_lexical_model_event
        # No need to check broadcast_needed flags here anymore
        
        # Handle direct response needs (for operations that need to send data back to sender)
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
    
    def generate_client_id(self) -> str:
        """Generate a unique client ID"""
        timestamp = int(time.time() * 1000)
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
        return f"py_client_{timestamp}_{suffix}"
    
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
