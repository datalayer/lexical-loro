#!/usr/bin/env python3

"""
Send a test update to the running server to simulate adding a paragraph.
"""

import asyncio
import json
import websockets
import sys
sys.path.append('.')

async def test_paragraph_addition():
    """Connect to server and add a paragraph to test block count increment"""
    uri = "ws://localhost:8081"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to server")
            
            # Wait for initial snapshots
            await asyncio.sleep(1)
            
            # Create a test update that adds a paragraph
            # This simulates what the browser would send when a user adds a paragraph
            
            # First, let's get the current state by requesting a snapshot
            await websocket.send(json.dumps({
                "type": "get-snapshot",
                "docId": "lexical-shared-doc"
            }))
            
            # Wait a bit for the snapshot response
            await asyncio.sleep(0.5)
            
            print("Sending update to add a paragraph...")
            
            # Send a loro-update that would simulate adding a paragraph
            # For now, let's send a minimal update message
            test_update = {
                "type": "loro-update",
                "docId": "lexical-shared-doc",
                "update": [1, 2, 3, 4, 5]  # Dummy update data
            }
            
            await websocket.send(json.dumps(test_update))
            print("Update sent!")
            
            # Wait to see server response
            await asyncio.sleep(2)
            
            print("Test complete")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_paragraph_addition())
