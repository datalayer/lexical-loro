#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script to simulate multiple clients with cursor movements
"""
import asyncio
import websockets
import json
import time
import logging
from loro import LoroDoc, EphemeralStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TestClient:
    def __init__(self, client_id: str, color: str):
        self.client_id = client_id
        self.color = color
        self.websocket = None
        self.loro_doc = LoroDoc()
        self.ephemeral_store = EphemeralStore(timeout=30)
        
    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            self.websocket = await websockets.connect("ws://localhost:8081")
            logger.info(f"🔗 Client {self.client_id} connected")
            
            # Start listening for messages
            asyncio.create_task(self.listen_for_messages())
            
            # Request initial state
            await self.request_snapshot()
            
        except Exception as e:
            logger.error(f"❌ Failed to connect client {self.client_id}: {e}")
    
    async def listen_for_messages(self):
        """Listen for incoming messages"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_message(data)
        except Exception as e:
            logger.error(f"❌ Error listening for messages on client {self.client_id}: {e}")
    
    async def handle_message(self, data):
        """Handle incoming messages"""
        message_type = data.get("type")
        
        if message_type == "snapshot":
            doc_id = data.get("docId")
            snapshot_data = bytes.fromhex(data.get("data", ""))
            if doc_id == "lexical-shared-doc" and snapshot_data:
                self.loro_doc.import_bytes(snapshot_data)
                logger.info(f"📄 Client {self.client_id} received snapshot for {doc_id}")
        
        elif message_type == "ephemeral-event":
            doc_id = data.get("docId")
            ephemeral_data = bytes.fromhex(data.get("data", ""))
            if doc_id == "lexical-shared-doc" and ephemeral_data:
                self.ephemeral_store.apply(ephemeral_data)
                logger.info(f"👁️ Client {self.client_id} received ephemeral event for {doc_id}")
                
                # Log cursor data from ephemeral store
                try:
                    all_cursors = self.ephemeral_store.getAll()
                    logger.info(f"🎯 Client {self.client_id} cursors: {all_cursors}")
                except Exception as e:
                    logger.info(f"🎯 Client {self.client_id} cursor data error: {e}")
    
    async def request_snapshot(self):
        """Request initial snapshot"""
        message = {
            "type": "request-snapshot",
            "docId": "lexical-shared-doc"
        }
        await self.websocket.send(json.dumps(message))
    
    async def send_cursor_position(self, position: int):
        """Send cursor position to the server"""
        try:
            # Create cursor data in the ephemeral store
            cursor_data = {
                "clientId": self.client_id,
                "position": position,
                "color": self.color,
                "timestamp": int(time.time() * 1000)
            }
            
            # Store in local ephemeral store and send to server
            self.ephemeral_store.set(self.client_id, cursor_data)
            ephemeral_bytes = self.ephemeral_store.encode_all()
            
            message = {
                "type": "ephemeral-update",
                "docId": "lexical-shared-doc",
                "data": ephemeral_bytes.hex()
            }
            
            await self.websocket.send(json.dumps(message))
            logger.info(f"📤 Client {self.client_id} sent cursor at position {position}")
            
        except Exception as e:
            logger.error(f"❌ Error sending cursor position for client {self.client_id}: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    async def disconnect(self):
        """Disconnect from the server"""
        if self.websocket:
            await self.websocket.close()
            logger.info(f"🔌 Client {self.client_id} disconnected")

async def test_collaborative_cursors():
    """Test collaborative cursors with multiple clients"""
    logger.info("🚀 Starting collaborative cursor test")
    
    # Create test clients
    client1 = TestClient("test_client_1", "#ff0000")  # Red
    client2 = TestClient("test_client_2", "#00ff00")  # Green
    
    try:
        # Connect both clients
        await client1.connect()
        await asyncio.sleep(1)  # Wait for connection
        
        await client2.connect()
        await asyncio.sleep(1)  # Wait for connection
        
        # Simulate cursor movements
        logger.info("🎯 Starting cursor movement simulation")
        
        # Client 1 moves cursor
        await client1.send_cursor_position(5)
        await asyncio.sleep(0.5)
        
        # Client 2 moves cursor
        await client2.send_cursor_position(10)
        await asyncio.sleep(0.5)
        
        # Client 1 moves again
        await client1.send_cursor_position(15)
        await asyncio.sleep(0.5)
        
        # Client 2 moves again
        await client2.send_cursor_position(20)
        await asyncio.sleep(2)  # Wait to see ephemeral events
        
        logger.info("✅ Cursor movement test completed")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
    
    finally:
        # Cleanup
        await client1.disconnect()
        await client2.disconnect()

if __name__ == "__main__":
    asyncio.run(test_collaborative_cursors())
