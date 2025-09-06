#!/usr/bin/env python3
"""
Debug insert-paragraph WebSocket message handling
"""

import asyncio
import json
import websockets

async def test_insert_paragraph_websocket():
    """Test if the WebSocket server handles insert-paragraph messages"""
    uri = "ws://localhost:8081/example-1"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Wait for welcome/initial messages
            await asyncio.sleep(1)
            
            # First, add some content to have something to insert between
            for i in range(4):
                append_msg = {
                    "type": "append-paragraph",
                    "docId": "example-1",
                    "message": f"Initial paragraph {i+1}"
                }
                print(f"📤 Sending append message {i+1}: {append_msg}")
                await websocket.send(json.dumps(append_msg))
                await asyncio.sleep(0.5)
            
            # Now try insert at index 2
            insert_msg = {
                "type": "insert-paragraph",
                "docId": "example-1",
                "message": "🧪 INSERTED at index 2 - Should appear between paragraph 2 and 3!",
                "index": 2
            }
            
            print(f"\n📤 Sending insert message: {insert_msg}")
            await websocket.send(json.dumps(insert_msg))
            
            # Wait and see what responses we get
            print("\n📨 Waiting for responses...")
            await asyncio.sleep(3)
            
            print("✅ Test completed")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_insert_paragraph_websocket())
