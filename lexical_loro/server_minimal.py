#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Step 8: Minimal WebSocket Server (~200 lines) using LexicalModel

This demonstrates clean separation of concerns:
- Server: WebSocket + Client Management (this file)
- LexicalModel: All Document Logic (imported library)

Easy to swap with FastAPI, Flask, Django, etc.
"""

import asyncio
import json
import logging
import hashlib
from typing import Dict
import websockets
from .model.lexical_model import LexicalModel

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)


class Client:
    """Simple client representation"""
    def __init__(self, websocket, client_id: str):
        self.websocket = websocket
        self.id = client_id
        self.color = self._generate_color()
        
    def _generate_color(self):
        """Generate a unique color for this client"""
        colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", 
                 "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43"]
        return colors[hash(self.id) % len(colors)]


class MinimalLoroServer:
    """
    Step 8: Minimal server demonstrating clean separation.
    
    Server Responsibilities (this class):
    - WebSocket connections and lifecycle
    - Message routing to LexicalModel
    - Broadcasting responses
    
    LexicalModel Responsibilities (imported library):
    - Document state and CRDT operations
    - Ephemeral data management
    - Serialization and snapshots
    """
    
    def __init__(self, port: int = 8081, host: str = "localhost"):
        self.port = port
        self.host = host
        self.clients: Dict[str, Client] = {}
        self.documents: Dict[str, LexicalModel] = {}
    
    def get_document(self, doc_id: str) -> LexicalModel:
        """Get or create document using LexicalModel library"""
        if doc_id not in self.documents:
            # Create document with appropriate initial content
            if 'lexical' in doc_id:
                # For Lexical documents, start with structured JSON
                initial_content = {
                    "editorState": {
                        "root": {
                            "children": [
                                {
                                    "children": [
                                        {
                                            "detail": 0,
                                            "format": 0,
                                            "mode": "normal",
                                            "style": "",
                                            "text": "Minimal Server Demo",
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
                                            "text": "Type to test collaboration...",
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
                        }
                    },
                    "lastSaved": 1756469000000,
                    "source": "Minimal Server",
                    "version": "0.34.0"
                }
                self.documents[doc_id] = LexicalModel.from_json(json.dumps(initial_content), doc_id)
            else:
                # For plain text documents
                self.documents[doc_id] = LexicalModel.create_document(doc_id)
            
            logger.info(f"📄 Created document: {doc_id}")
        
        return self.documents[doc_id]
    
    async def start(self):
        """Start the minimal WebSocket server"""
        logger.info(f"🚀 Minimal Loro server starting on {self.host}:{self.port}")
        
        async with websockets.serve(self.handle_client, self.host, self.port):
            logger.info(f"✅ Minimal server ready at ws://{self.host}:{self.port}")
            logger.info("🎯 Demonstrating clean separation: Server=WebSocket, LexicalModel=Documents")
            
            # Keep running
            await asyncio.Future()
    
    async def handle_client(self, websocket):
        """Handle client connection lifecycle"""
        client_id = self._generate_client_id()
        self.clients[client_id] = Client(websocket, client_id)
        logger.info(f"👋 Client connected: {client_id} (total: {len(self.clients)})")
        
        try:
            # Send welcome message
            await websocket.send(json.dumps({
                "type": "welcome",
                "clientId": client_id,
                "color": self.clients[client_id].color,
                "message": "Connected to Minimal Loro Server (Step 8)"
            }))
            
            # Send existing document snapshots
            await self._send_initial_snapshots(websocket, client_id)
            
            # Handle incoming messages
            async for message in websocket:
                await self.handle_message(client_id, message)
                
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"👋 Client disconnected: {client_id}")
        except Exception as e:
            logger.error(f"❌ Error with client {client_id}: {e}")
        finally:
            # Clean up
            self.clients.pop(client_id, None)
            logger.info(f"🧹 Cleaned up client: {client_id} (total: {len(self.clients)})")
    
    async def _send_initial_snapshots(self, websocket, client_id: str):
        """Send snapshots of existing documents to new client"""
        for doc_id in ['shared-text', 'lexical-shared-doc']:
            model = self.get_document(doc_id)
            snapshot_data = model.to_json()
            
            await websocket.send(json.dumps({
                "type": "initial-snapshot",
                "docId": doc_id,
                "data": snapshot_data
            }))
            logger.info(f"📄 Sent {doc_id} snapshot to {client_id}")
    
    async def handle_message(self, client_id: str, message: str):
        """Route message to LexicalModel and handle response"""
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            doc_id = data.get("docId", "shared-text")
            
            logger.info(f"📨 {msg_type} for {doc_id} from {client_id}")
            
            # Get the document (creates if needed)
            model = self.get_document(doc_id)
            
            # Add client info for better UX
            data["clientId"] = client_id
            data["color"] = self.clients[client_id].color
            
            # Route to appropriate handler based on message type
            if msg_type == "loro-update":
                await self._handle_loro_update(model, data, client_id, doc_id)
            elif msg_type == "request-snapshot":
                await self._handle_snapshot_request(model, data, client_id, doc_id)
            elif msg_type in ["ephemeral-update", "awareness-update"]:
                await self._handle_ephemeral_update(model, data, client_id, doc_id)
            else:
                logger.warning(f"⚠️ Unknown message type: {msg_type}")
                
        except json.JSONDecodeError:
            logger.error(f"❌ Invalid JSON from {client_id}")
        except Exception as e:
            logger.error(f"❌ Error processing message from {client_id}: {e}")
    
    async def _handle_loro_update(self, model: LexicalModel, data: dict, client_id: str, doc_id: str):
        """Handle document updates using LexicalModel"""
        try:
            update_data = data.get("update", [])
            if update_data:
                # Apply update using LexicalModel
                update_bytes = bytes(update_data)
                success = model.apply_update(update_bytes)
                
                if success:
                    # Broadcast to other clients
                    await self._broadcast_to_others(client_id, {
                        "type": "loro-update",
                        "docId": doc_id,
                        "update": update_data,
                        "clientId": client_id
                    })
                    logger.info(f"✅ Applied and broadcast loro-update for {doc_id}")
                else:
                    logger.error(f"❌ Failed to apply loro-update for {doc_id}")
        except Exception as e:
            logger.error(f"❌ Error in loro-update: {e}")
    
    async def _handle_snapshot_request(self, model: LexicalModel, data: dict, client_id: str, doc_id: str):
        """Handle snapshot requests using LexicalModel"""
        try:
            # Get snapshot from LexicalModel
            snapshot_data = model.to_json()
            
            # Send back to requesting client
            client = self.clients.get(client_id)
            if client:
                await client.websocket.send(json.dumps({
                    "type": "snapshot",
                    "docId": doc_id,
                    "data": snapshot_data
                }))
                logger.info(f"📤 Sent snapshot for {doc_id} to {client_id}")
        except Exception as e:
            logger.error(f"❌ Error in snapshot request: {e}")
    
    async def _handle_ephemeral_update(self, model: LexicalModel, data: dict, client_id: str, doc_id: str):
        """Handle ephemeral updates (cursors, selections) using LexicalModel"""
        try:
            # Note: LexicalModel handles ephemeral data internally
            # For minimal server, we just broadcast to other clients
            await self._broadcast_to_others(client_id, {
                "type": data.get("type"),
                "docId": doc_id,
                "data": data.get("data"),
                "clientId": client_id,
                "color": data.get("color")
            })
            logger.info(f"🔄 Broadcast ephemeral update for {doc_id}")
        except Exception as e:
            logger.error(f"❌ Error in ephemeral update: {e}")
    
    async def _broadcast_to_others(self, sender_id: str, message: dict):
        """Broadcast message to all clients except sender"""
        if len(self.clients) <= 1:
            return
            
        message_str = json.dumps(message)
        failed_clients = []
        
        for client_id, client in self.clients.items():
            if client_id != sender_id:
                try:
                    await client.websocket.send(message_str)
                except Exception as e:
                    logger.error(f"❌ Failed to send to {client_id}: {e}")
                    failed_clients.append(client_id)
        
        # Remove failed clients
        for client_id in failed_clients:
            self.clients.pop(client_id, None)
    
    def _generate_client_id(self) -> str:
        """Generate unique client ID"""
        import random, string, time
        timestamp = int(time.time() * 1000)
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
        return f"minimal_{timestamp}_{suffix}"


# Alternative minimal implementations showing easy swapping

class FastAPIMinimalServer:
    """Example: Same logic with FastAPI (pseudo-code)"""
    
    def __init__(self):
        from fastapi import FastAPI, WebSocket
        self.app = FastAPI()
        self.documents: Dict[str, LexicalModel] = {}
        
    def get_document(self, doc_id: str) -> LexicalModel:
        """Same document logic using LexicalModel"""
        if doc_id not in self.documents:
            self.documents[doc_id] = LexicalModel.create_document(doc_id)
        return self.documents[doc_id]
        
    # @app.websocket("/ws")
    # async def websocket_endpoint(self, websocket: WebSocket):
    #     # Same client handling logic as MinimalLoroServer.handle_client()
    #     pass


class FlaskSocketIOMinimalServer:
    """Example: Same logic with Flask-SocketIO (pseudo-code)"""
    
    def __init__(self):
        from flask import Flask
        from flask_socketio import SocketIO
        self.app = Flask(__name__)
        self.socketio = SocketIO(self.app)
        self.documents: Dict[str, LexicalModel] = {}
        
    def get_document(self, doc_id: str) -> LexicalModel:
        """Same document logic using LexicalModel"""
        if doc_id not in self.documents:
            self.documents[doc_id] = LexicalModel.create_document(doc_id)
        return self.documents[doc_id]
        
    # @socketio.on('message')
    # def handle_message(self, data):
    #     # Same message handling logic as MinimalLoroServer.handle_message()
    #     pass


# CLI entry point
async def main():
    """Main entry point for minimal server"""
    import sys
    
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8082
    server = MinimalLoroServer(port=port)
    
    try:
        await server.start()
    except KeyboardInterrupt:
        logger.info("🛑 Minimal server stopped")


if __name__ == "__main__":
    asyncio.run(main())
