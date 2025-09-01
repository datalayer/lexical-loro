#!/usr/bin/env python3
"""
Test collaborative flow with WebSocket server running
"""

import asyncio
import json
import websockets
from lexical_loro.mcp.server import document_manager, initialize_mcp_collaboration, append_paragraph

async def test_collaborative_flow():
    """Test full collaborative flow with WebSocket connection"""
    print("🧪 Testing collaborative flow with WebSocket server...")
    
    # Initialize MCP collaboration with async connection
    await initialize_mcp_collaboration()
    
    # Get or create document
    print("📄 Getting or creating document...")
    result = await document_manager.get_or_create_document("test-collab-doc")
    print(f"✅ Document result: {json.dumps(result, indent=2)}")
    
    # Wait a moment for connection to establish
    await asyncio.sleep(1)
    
    # Check connection status
    print(f"🔌 WebSocket client connected: {document_manager.connected}")
    print(f"🔗 WebSocket URL: {document_manager.websocket_url}")
    
    # Append a paragraph through MCP
    print("➕ Appending paragraph through MCP...")
    result = await append_paragraph("Hello from collaborative MCP test!", None)
    print(f"📤 Append result: {json.dumps(result, indent=2)}")
    
    # Wait a moment for propagation
    await asyncio.sleep(1)
    
    print("✅ Collaborative test completed!")

async def test_websocket_listener():
    """Listen to WebSocket server to see if changes arrive"""
    print("👂 Starting WebSocket listener...")
    
    try:
        uri = "ws://localhost:8081"
        async with websockets.connect(uri) as websocket:
            print(f"🔌 Connected to WebSocket server at {uri}")
            
            # Join the same document
            join_message = {
                "type": "join_document",
                "doc_id": "test-collab-doc"
            }
            await websocket.send(json.dumps(join_message))
            print("📄 Joined document: test-collab-doc")
            
            # Listen for messages for a few seconds
            print("👂 Listening for collaborative messages...")
            try:
                while True:
                    message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(message)
                    print(f"📨 Received: {data.get('type', 'unknown')} - {json.dumps(data, indent=2)}")
            except asyncio.TimeoutError:
                print("⏰ Timeout - no more messages")
                
    except Exception as e:
        print(f"❌ WebSocket listener error: {e}")

async def main():
    """Run both tests"""
    # Run listener in background
    listener_task = asyncio.create_task(test_websocket_listener())
    
    # Wait a moment for listener to connect
    await asyncio.sleep(2)
    
    # Run collaborative flow test
    await test_collaborative_flow()
    
    # Wait for listener to finish
    await asyncio.sleep(3)
    listener_task.cancel()

if __name__ == "__main__":
    asyncio.run(main())
