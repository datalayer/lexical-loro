#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test multiple clients to verify collaborative cursors and awareness work.
"""

import asyncio
import json
import logging
import websockets
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def client_session(client_name: str, doc_id: str = "example-1"):
    """Run a client session with awareness updates"""
    
    server_url = f"ws://localhost:8081/ws/{doc_id}"
    
    try:
        async with websockets.connect(server_url) as websocket:
            print(f"✅ {client_name} connected to {server_url}")
            
            # Wait for welcome message
            welcome_msg = await websocket.recv()
            welcome_data = json.loads(welcome_msg)
            
            if welcome_data.get('type') == 'welcome':
                client_id = welcome_data.get('clientId')
                color = welcome_data.get('color')
                print(f"👋 {client_name} registered: ID={client_id}, Color={color}")
                
                # Send initial awareness (mock cursor data)
                awareness_msg = {
                    "type": "ephemeral-update",
                    "docId": doc_id,
                    "data": f"deadbeef0{client_name[-1]}"  # Mock hex data with unique ending (even length)
                }
                
                await websocket.send(json.dumps(awareness_msg))
                print(f"📤 {client_name} sent initial awareness")
                
                # Listen for incoming messages for a while
                try:
                    for _ in range(3):  # Listen for 3 messages or timeout
                        response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                        response_data = json.loads(response)
                        
                        if response_data.get('type') == 'ephemeral-update':
                            print(f"📨 {client_name} received ephemeral update from another client")
                        elif response_data.get('type') == 'initial-snapshot':
                            print(f"📄 {client_name} received snapshot")
                        elif response_data.get('type') == 'error':
                            print(f"❌ {client_name} received error: {response_data}")
                        else:
                            print(f"📨 {client_name} received: {response_data.get('type', 'unknown')} - {response_data}")
                            
                except asyncio.TimeoutError:
                    print(f"⏰ {client_name} no more messages")
                
                print(f"✅ {client_name} session completed successfully")
                
            else:
                print(f"❌ {client_name} unexpected welcome: {welcome_data}")
                
    except Exception as e:
        print(f"❌ {client_name} failed: {e}")

async def test_multi_client_awareness():
    """Test multiple clients for collaborative awareness"""
    
    print("🧪 Testing Multi-Client Collaborative Awareness")
    print("=" * 60)
    
    # Run two clients concurrently
    await asyncio.gather(
        client_session("Client-1"),
        client_session("Client-2"),
        return_exceptions=True
    )
    
    print("🏁 Multi-client test completed")

if __name__ == "__main__":
    asyncio.run(test_multi_client_awareness())
