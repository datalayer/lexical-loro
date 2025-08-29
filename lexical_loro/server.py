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
from .model.lexical_model import LexicalModel, LexicalDocumentManager


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
    """
    Step 6: Pure WebSocket Relay Server with Multi-Document Support
    
    This server is a thin relay that only handles:
    - WebSocket client connections
    - Message routing to LexicalDocumentManager
    - Broadcasting responses from documents
    
    All document and ephemeral data management is delegated to LexicalDocumentManager.
    """
    
    def __init__(self, port: int = 8081, host: str = "localhost"):
        self.port = port
        self.host = host
        self.clients: Dict[str, Client] = {}
        self.document_manager = LexicalDocumentManager(
            event_callback=self._on_document_event,
            ephemeral_timeout=300000  # 5 minutes ephemeral timeout
        )
        self.running = False
    
    def get_document(self, doc_id: str) -> LexicalModel:
        """
        Get or create a document through the document manager.
        Step 6: Delegate to LexicalDocumentManager.
        """
        # Provide initial content for lexical documents
        initial_content = None
        if doc_id == 'lexical-shared-doc':
            initial_content = INITIAL_LEXICAL_JSON
        
        return self.document_manager.get_or_create_document(doc_id, initial_content)

    def _on_document_event(self, event_type: str, event_data: dict):
        """
        Handle events from LexicalDocumentManager.
        Step 6: Server only handles broadcasting, no document logic.
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
                "message": "Connected to Loro CRDT relay (Python)"
            }))
            
            # Send initial snapshots to the new client
            await self.send_initial_snapshots(websocket, client_id)
            
            # Listen for messages from this client
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📴 Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_id}: {e}")
        finally:
            # Step 6: Delegate client cleanup to DocumentManager
            logger.info(f"🧹 Cleaning up client {client_id}")
            
            # Clean up client data in all managed documents
            for doc_id in self.document_manager.list_documents():
                try:
                    model = self.document_manager.get_or_create_document(doc_id)
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
    
    async def send_initial_snapshots(self, websocket: WebSocketServerProtocol, client_id: str):
        """
        Send initial snapshots for known documents.
        Step 6: Create documents with initial content and send snapshots.
        """
        # For known document types, create documents with initial content and send snapshots
        for doc_id in ['shared-text', 'lexical-shared-doc']:
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
                        "docId": doc_id
                    }))
                    logger.info(f"📄 Sent {doc_id} snapshot ({len(snapshot_bytes)} bytes) to client {client_id}")
                else:
                    logger.info(f"📄 No content in {doc_id} to send to client {client_id}")
                    
            except Exception as e:
                logger.error(f"❌ Error sending snapshot for {doc_id} to {client_id}: {e}")
    
    async def handle_message(self, client_id: str, message: str):
        """
        Handle a message from a client.
        Step 5: Pure delegation to LexicalModel - server doesn't process messages.
        """
        try:
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId", "shared-text")
            
            logger.info(f"📨 {message_type} for {doc_id} from {client_id}")
            
            # Add client color to data for better UX
            client = self.clients.get(client_id)
            if client and "color" not in data:
                data["color"] = client.color
            
            # Step 6: Delegate message handling to DocumentManager
            response = self.document_manager.handle_message(doc_id, message_type, data, client_id)
            
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
        Step 5: Server only handles success/error and direct responses.
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
        Step 5: Pure broadcasting function - no document logic.
        """
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
                    
                    # Log basic stats - Step 6: Use document manager
                    doc_count = len(self.document_manager.list_documents())
                    logger.info(f"📊 Relay stats: {len(self.clients)} clients, {doc_count} documents")
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"❌ Error in stats loop: {e}")
    
    async def shutdown(self):
        """Gracefully shutdown the server"""
        logger.info("🛑 Shutting down Loro WebSocket relay...")
        self.running = False
        
        # Close all client connections
        clients_to_close = list(self.clients.values())
        for client in clients_to_close:
            try:
                await client.websocket.close()
            except Exception:
                pass
        
        self.clients.clear()
        
        # Step 6: Clean up document manager
        self.document_manager.cleanup()
        
        logger.info("✅ Relay shutdown complete")


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
