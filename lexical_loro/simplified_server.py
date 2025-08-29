#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Simplified Loro WebSocket server using LexicalModel message handling

This version demonstrates the dramatic simplification achieved by delegating
all Loro operations to LexicalModel.handle_message()

BEFORE: 1000+ lines with complex Loro document management
AFTER: ~300 lines focused purely on WebSocket communication
"""

import asyncio
import json
import logging
import sys
import time
import hashlib
import random
import string
from typing import Dict, Any
import websockets
from websockets.legacy.server import WebSocketServerProtocol
from .model.lexical_model import LexicalModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

INITIAL_LEXICAL_JSON = {
    "root": {
        "children": [
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Lexical with Loro (Simplified Server)",
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
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1,
                "textFormat": 0,
                "textStyle": ""
            }
        ],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    },
    "lastSaved": int(time.time() * 1000),
    "source": "Simplified Lexical Loro",
    "version": "0.34.0"
}


class Client:
    def __init__(self, websocket: WebSocketServerProtocol, client_id: str):
        self.websocket = websocket
        self.id = client_id
        self.color = self._generate_color()
        
    def _generate_color(self):
        """Generate a unique color for this client"""
        hash_val = int(hashlib.md5(self.id.encode()).hexdigest()[:6], 16)
        colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
            '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
            '#C44569', '#F8B500', '#6C5CE7', '#A29BFE', '#FD79A8'
        ]
        return colors[hash_val % len(colors)]


class SimplifiedLoroWebSocketServer:
    """
    Simplified WebSocket server that delegates all Loro operations to LexicalModel
    
    Responsibilities:
    - WebSocket connection management
    - Client tracking and messaging
    - Broadcasting messages
    - Delegating Loro operations to LexicalModel
    """
    
    def __init__(self, port: int = 8081):
        self.port = port
        self.clients: Dict[str, Client] = {}
        self.lexical_models: Dict[str, LexicalModel] = {}  # Simplified: only LexicalModels
        self.running = False
        
        # Initialize with some default documents
        self._initialize_default_documents()
    
    def _initialize_default_documents(self):
        """Initialize default documents using LexicalModel.create_document()"""
        default_docs = ['shared-text', 'lexical-shared-doc']
        
        for doc_id in default_docs:
            try:
                # Use LexicalModel.create_document() - much simpler!
                initial_content = INITIAL_LEXICAL_JSON if doc_id == 'lexical-shared-doc' else None
                
                self.lexical_models[doc_id] = LexicalModel.create_document(
                    doc_id=doc_id,
                    initial_content=initial_content,
                    change_callback=self._on_model_change
                )
                
                logger.info(f"📄 Initialized document: {doc_id}")
                
            except Exception as e:
                logger.error(f"❌ Failed to initialize {doc_id}: {e}")
    
    def _on_model_change(self, model):
        """Callback when a LexicalModel changes"""
        doc_info = model.get_document_info()
        logger.info(f"📄 Model changed: {model.container_id} - {doc_info['lexical_blocks']} blocks")
    
    def get_or_create_model(self, doc_id: str) -> LexicalModel:
        """Get or create a LexicalModel for the given doc_id"""
        if doc_id not in self.lexical_models:
            # Use LexicalModel.create_document() - Step 1 feature
            self.lexical_models[doc_id] = LexicalModel.create_document(
                doc_id=doc_id,
                change_callback=self._on_model_change
            )
            logger.info(f"📄 Created new document: {doc_id}")
        
        return self.lexical_models[doc_id]
    
    async def start(self):
        """Start the WebSocket server"""
        logger.info(f"🚀 Simplified Loro WebSocket server starting on port {self.port}")
        
        self.running = True
        
        async with websockets.serve(
            self.handle_client,
            "localhost",
            self.port,
            ping_interval=20,
            ping_timeout=10
        ):
            logger.info(f"✅ Simplified server running on ws://localhost:{self.port}")
            
            try:
                while self.running:
                    await asyncio.sleep(1)
            except (KeyboardInterrupt, asyncio.CancelledError):
                logger.info("🛑 Server shutdown requested")
            finally:
                self.running = False
    
    async def handle_client(self, websocket: WebSocketServerProtocol):
        """Handle a new client connection"""
        client_id = self.generate_client_id()
        client = Client(websocket, client_id)
        
        self.clients[client_id] = client
        logger.info(f"📱 Client {client_id} connected. Total: {len(self.clients)}")
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "welcome",
                "clientId": client_id,
                "color": client.color,
                "message": "Connected to Simplified Loro server"
            }))
            
            # Send initial snapshots
            await self.send_initial_snapshots(websocket, client_id)
            
            # Listen for messages
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"📴 Client {client_id} disconnected normally")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_id}: {e}")
        finally:
            if client_id in self.clients:
                del self.clients[client_id]
            logger.info(f"📴 Client {client_id} removed. Total: {len(self.clients)}")
    
    async def send_initial_snapshots(self, websocket: WebSocketServerProtocol, client_id: str):
        """Send initial snapshots using LexicalModel.get_snapshot()"""
        for doc_id, model in self.lexical_models.items():
            try:
                # Use LexicalModel.get_snapshot() - Step 1 feature
                snapshot = model.get_snapshot()
                
                if snapshot and len(snapshot) > 0:
                    await websocket.send(json.dumps({
                        "type": "initial-snapshot",
                        "snapshot": list(snapshot),
                        "docId": doc_id
                    }))
                    logger.info(f"📄 Sent {doc_id} snapshot ({len(snapshot)} bytes) to {client_id}")
                    
            except Exception as e:
                logger.error(f"❌ Error sending snapshot for {doc_id}: {e}")
    
    async def handle_message(self, client_id: str, message: str):
        """
        Simplified message handling using LexicalModel.handle_message()
        
        BEFORE: 200+ lines of complex Loro-specific logic
        AFTER: ~30 lines of delegation and response handling
        """
        try:
            data = json.loads(message)
            message_type = data.get("type")
            doc_id = data.get("docId", "shared-text")
            
            logger.info(f"📨 {message_type} for {doc_id} from {client_id}")
            
            # Define Loro-related message types
            loro_message_types = ["loro-update", "snapshot", "request-snapshot", "append-paragraph"]
            
            if message_type in loro_message_types:
                # Delegate to LexicalModel - Step 2 feature!
                model = self.get_or_create_model(doc_id)
                response = model.handle_message(message_type, data, client_id)
                
                # Handle the structured response from LexicalModel
                await self._handle_model_response(response, client_id, doc_id)
                
            elif message_type in ["ephemeral-update", "ephemeral", "awareness-update", "cursor-position", "text-selection"]:
                # TODO: Step 3 will handle these via LexicalModel as well
                logger.info(f"📡 Ephemeral message {message_type} - will be handled in Step 3")
                
            else:
                logger.warning(f"❓ Unknown message type: {message_type}")
                await self.send_error(client_id, f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error(f"❌ Invalid JSON from {client_id}")
            await self.send_error(client_id, "Invalid message format")
        except Exception as e:
            logger.error(f"❌ Error processing message from {client_id}: {e}")
            await self.send_error(client_id, f"Server error: {str(e)}")
    
    async def _handle_model_response(self, response: Dict[str, Any], client_id: str, doc_id: str):
        """Handle structured response from LexicalModel.handle_message()"""
        message_type = response.get("message_type", "unknown")
        
        if not response.get("success"):
            # Handle error response
            error_msg = response.get("error", "Unknown error")
            logger.error(f"❌ {message_type} failed: {error_msg}")
            await self.send_error(client_id, f"{message_type} failed: {error_msg}")
            return
        
        # Handle successful response
        logger.info(f"✅ {message_type} succeeded for {doc_id}")
        
        # Handle broadcast needs
        if response.get("broadcast_needed"):
            broadcast_data = response.get("broadcast_data", {})
            await self.broadcast_to_others(client_id, broadcast_data)
            logger.info(f"📡 Broadcasted {message_type} to {len(self.clients) - 1} other clients")
        
        # Handle direct response needs
        if response.get("response_needed"):
            response_data = response.get("response_data", {})
            await self.send_to_client(client_id, response_data)
            logger.info(f"📤 Sent response to {client_id}")
        
        # Log document state changes
        if response.get("document_info"):
            doc_info = response["document_info"]
            logger.info(f"📋 {doc_id}: {doc_info.get('lexical_blocks', 0)} blocks, {doc_info.get('content_length', 0)} chars")
    
    async def send_error(self, client_id: str, error_message: str):
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
    
    async def send_to_client(self, client_id: str, data: Dict[str, Any]):
        """Send data to specific client"""
        client = self.clients.get(client_id)
        if client:
            try:
                await client.websocket.send(json.dumps(data))
            except Exception as e:
                logger.error(f"❌ Failed to send to {client_id}: {e}")
                if client_id in self.clients:
                    del self.clients[client_id]
    
    async def broadcast_to_others(self, sender_id: str, data: Dict[str, Any]):
        """Broadcast data to all clients except sender"""
        if len(self.clients) <= 1:
            return
            
        message_str = json.dumps(data)
        failed_clients = []
        
        for client_id, client in self.clients.items():
            if client_id != sender_id:
                try:
                    await client.websocket.send(message_str)
                except Exception as e:
                    logger.error(f"❌ Failed to broadcast to {client_id}: {e}")
                    failed_clients.append(client_id)
        
        # Remove failed clients
        for client_id in failed_clients:
            if client_id in self.clients:
                del self.clients[client_id]
    
    def generate_client_id(self) -> str:
        """Generate a unique client ID"""
        timestamp = int(time.time() * 1000)
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"client_{timestamp}_{suffix}"
    
    async def shutdown(self):
        """Gracefully shutdown the server"""
        logger.info("🛑 Shutting down simplified server...")
        self.running = False
        
        # Close all client connections
        for client in list(self.clients.values()):
            try:
                await client.websocket.close()
            except Exception:
                pass
        
        self.clients.clear()
        self.lexical_models.clear()
        logger.info("✅ Simplified server shutdown complete")


async def main():
    """Main entry point"""
    server = SimplifiedLoroWebSocketServer(8081)
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("🛑 Received KeyboardInterrupt")
        await server.shutdown()
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
        await server.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("🛑 Server stopped by user")
    except Exception as e:
        logger.error(f"❌ Failed to start server: {e}")
        sys.exit(1)
    
    logger.info("🛑 Simplified server stopped")
    sys.exit(0)
