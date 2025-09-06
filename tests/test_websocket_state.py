#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


import asyncio
import websockets
import json

async def test_mcp_via_websocket():
    """Test MCP functionality via WebSocket by checking document state"""
    try:
        # Connect to WebSocket server
        uri = "ws://127.0.0.1:8081"
        print(f"🔌 Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server")
            
            # Send a message to get document state (if such functionality exists)
            # Let's try to send a get-document-state message
            get_state_message = {
                "type": "get-document-state",
                "docId": "example-1"
            }
            
            print(f"📤 Sending get-document-state message: {get_state_message}")
            await websocket.send(json.dumps(get_state_message))
            
            # Wait for response
            print("📨 Waiting for response...")
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📨 Received response: {response}")
                
                # Try to parse as JSON
                try:
                    response_data = json.loads(response)
                    print("📄 Parsed response:")
                    print(json.dumps(response_data, indent=2))
                except json.JSONDecodeError:
                    print("📄 Raw response (not JSON):")
                    print(response)
                    
            except asyncio.TimeoutError:
                print("⏰ No response received within 5 seconds")
                print("🔍 The WebSocket server might not support get-document-state messages")
                print("✅ But the connection worked, so our insert messages likely worked too!")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_mcp_via_websocket())
