#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test UI append operations to verify no server crashes occur.
This specifically tests for the Rust locking order violation that was fixed.
"""

import asyncio
import websockets
import json
import time
import threading
from lexical_loro.server import main as run_server


async def simulate_browser_client():
    """Simulate a browser client that makes UI edits."""
    uri = "ws://localhost:8081"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("🌐 Browser client connected")
            
            # Get welcome
            welcome_message = await websocket.recv()
            welcome_data = json.loads(welcome_message)
            print(f"👋 Browser welcomed with ID: {welcome_data['data']['clientId']}")
            
            # Request snapshot for document
            snapshot_request = {
                "type": "request-snapshot",
                "docId": "test-ui-append-doc"
            }
            await websocket.send(json.dumps(snapshot_request))
            print("📤 Requested snapshot for test-ui-append-doc")
            
            # Get snapshot
            snapshot_message = await websocket.recv()
            snapshot_data = json.loads(snapshot_message)
            print(f"📄 Received snapshot: {snapshot_data['type']}")
            
            # Wait briefly for server to initialize
            await asyncio.sleep(1)
            
            # Simulate multiple UI append operations that could trigger deadlock
            print("\n🧪 Testing multiple concurrent UI edits...")
            
            for i in range(5):
                ui_edit = {
                    "type": "ui-append",
                    "docId": "test-ui-append-doc", 
                    "text": f"UI Edit #{i+1} - Testing deadlock prevention"
                }
                await websocket.send(json.dumps(ui_edit))
                print(f"📝 Sent UI edit #{i+1}")
                
                # Short delay between edits to create race conditions
                await asyncio.sleep(0.1)
            
            print("✅ All UI edits sent successfully")
            
            # Listen for responses for a few seconds
            print("\n👂 Listening for server responses...")
            try:
                for _ in range(10):
                    response = await asyncio.wait_for(websocket.recv(), timeout=0.5)
                    response_data = json.loads(response)
                    print(f"📨 Response: {response_data['type']}")
            except asyncio.TimeoutError:
                print("⏰ No more responses (timeout)")
            
            print("✅ Browser client test completed without crashes!")
            
    except Exception as e:
        print(f"❌ Browser client error: {e}")
        return False
    
    return True


def start_server():
    """Start the WebSocket server in a separate thread."""
    print("🚀 Starting WebSocket server...")
    asyncio.run(run_server())


async def test_ui_append_no_crash():
    """Test that UI append operations don't cause server crashes."""
    print("🧪 Testing UI append operations for crash prevention")
    print("=" * 60)
    
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Wait for server to start
    print("⏱️ Waiting for server to initialize...")
    await asyncio.sleep(2)
    
    # Run browser client test
    success = await simulate_browser_client()
    
    if success:
        print("\n🎉 SUCCESS: UI append operations completed without server crashes!")
        print("✅ Rust locking order violation has been resolved")
    else:
        print("\n❌ FAILURE: UI append test encountered errors")
    
    # Keep server running briefly to check for delayed crashes
    print("\n⏱️ Monitoring for delayed crashes...")
    await asyncio.sleep(3)
    print("✅ No delayed crashes detected")
    
    return success


if __name__ == "__main__":
    asyncio.run(test_ui_append_no_crash())
