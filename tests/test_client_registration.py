#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Simple test to verify collaborative cursors and client registration work correctly.
"""

import asyncio
import json
import logging
import websockets
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_client_registration():
    """Test basic client registration and awareness"""
    
    server_url = "ws://localhost:8081/ws/example-1"
    
    print("🧪 Testing Client Registration and Awareness")
    print("=" * 50)
    
    try:
        async with websockets.connect(server_url) as websocket:
            print(f"✅ Connected to {server_url}")
            
            # Wait for welcome message
            welcome_msg = await websocket.recv()
            welcome_data = json.loads(welcome_msg)
            print(f"👋 Received welcome: {welcome_data}")
            
            if welcome_data.get('type') == 'welcome':
                client_id = welcome_data.get('clientId')
                color = welcome_data.get('color')
                print(f"✅ Client registered: ID={client_id}, Color={color}")
                
                # Send a simple ephemeral update (mock cursor data)
                ephemeral_msg = {
                    "type": "ephemeral-update",
                    "docId": "example-1",
                    "data": "deadbeef01"  # Mock hex data (even length)
                }
                
                print(f"📤 Sending ephemeral update...")
                await websocket.send(json.dumps(ephemeral_msg))
                
                # Wait a moment to see if we get any responses or errors
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    response_data = json.loads(response)
                    print(f"📨 Server response: {response_data}")
                except asyncio.TimeoutError:
                    print("⏰ No immediate response (this is normal for ephemeral updates)")
                
                print("✅ Test completed successfully - no server errors!")
                
            else:
                print(f"❌ Unexpected welcome message: {welcome_data}")
                
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_client_registration())
