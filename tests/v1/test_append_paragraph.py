#!/usr/bin/env python3

"""
Test the append-paragraph functionality by sending the command directly to the server.
"""

import asyncio
import json
import websockets
import sys
sys.path.append('.')


async def test_append_paragraph():
    """Connect to server and test the append-paragraph command"""
    uri = "ws://localhost:8081"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to server")
            
            # Wait for initial snapshots
            await asyncio.sleep(2)
            
            print("Sending append-paragraph command...")
            
            # Send append-paragraph command
            command = {
                "type": "append-paragraph",
                "docId": "lexical-shared-doc",
                "message": "Hello from test script!"
            }
            
            await websocket.send(json.dumps(command))
            print(f"✅ Sent command: {command}")
            
            # Wait to see server response and logs
            await asyncio.sleep(3)
            
            # Send another one
            command2 = {
                "type": "append-paragraph",
                "docId": "lexical-shared-doc",
                "message": "Second paragraph added!"
            }
            
            await websocket.send(json.dumps(command2))
            print(f"✅ Sent second command: {command2}")
            
            # Wait a bit more
            await asyncio.sleep(2)
            
            print("Test completed!")
            
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    asyncio.run(test_append_paragraph())
