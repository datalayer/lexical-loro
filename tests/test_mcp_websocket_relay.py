#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test WebSocket message relay between MCP client and browser
"""

import asyncio
import json
import websockets
from lexical_loro.mcp.server import append_paragraph, initialize_mcp_collaboration

async def websocket_listener():
    """Listen as a browser client would"""
    try:
        uri = "ws://localhost:8081"
        async with websockets.connect(uri) as websocket:
            print("🌐 Browser simulation connected to WebSocket server")
            
            # Join the shared document (simulate browser behavior)
            # Use the correct message format that the server expects
            request_snapshot_message = {
                "type": "request-snapshot",
                "docId": "lexical-shared-doc"
            }
            await websocket.send(json.dumps(request_snapshot_message))
            print("📄 Requested snapshot for document: lexical-shared-doc")
            
            # Listen for messages
            print("👂 Listening for messages from server...")
            message_count = 0
            async for message in websocket:
                try:
                    message_count += 1
                    data = json.loads(message)
                    msg_type = data.get('type', 'unknown')
                    print(f"📨 Message {message_count}: {msg_type}")
                    
                    # Show more details for important message types
                    if msg_type in ['loro-update', 'document-update']:
                        print(f"� IMPORTANT: Received {msg_type}!")
                        print(f"   📄 Doc ID: {data.get('docId', 'unknown')}")
                        print(f"   👤 Sender: {data.get('senderId', 'unknown')}")
                        if 'update' in data:
                            print(f"   📊 Update size: {len(data['update'])} bytes")
                        if 'snapshot' in data:
                            print(f"   � Snapshot size: {len(data['snapshot'])} bytes")
                        return True  # Success - we got a collaborative update!
                    
                    elif msg_type == 'snapshot':
                        print(f"📊 Snapshot message received! Doc: {data.get('docId', 'unknown')}")
                        print("📊 Initial snapshot - checking for subsequent updates...")
                        # Don't return here, keep listening for updates
                    elif msg_type == 'initial-snapshot':
                        print(f"📊 Initial snapshot received! Doc: {data.get('docId', 'unknown')}")
                        print("📊 Initial snapshot - checking for subsequent updates...")
                        # Don't return here, keep listening for updates
                    else:
                        print(f"ℹ️ Other message: {msg_type}")
                        # Don't show full JSON for non-critical messages
                        
                except json.JSONDecodeError:
                    print(f"❌ Invalid JSON: {message}")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
                    
    except Exception as e:
        print(f"❌ WebSocket listener error: {e}")
        return False

async def mcp_append_test():
    """Test MCP append with collaborative connection"""
    print("🚀 Starting MCP append test...")
    
    # Initialize MCP collaboration
    await initialize_mcp_collaboration()
    await asyncio.sleep(2)  # Let connection establish
    
    # Append via MCP
    print("➕ Sending MCP append...")
    result = await append_paragraph("🧪 Test message from MCP collaboration!", "lexical-shared-doc")
    print(f"📤 MCP result: {result}")
    
    # Parse the JSON result to check success
    try:
        if isinstance(result, str):
            result_dict = json.loads(result)
            return result_dict.get('success', False)
        elif isinstance(result, dict):
            return result.get('success', False)
        else:
            return False
    except (json.JSONDecodeError, AttributeError):
        return False

async def test_websocket_relay():
    """Test if WebSocket server relays MCP changes to browser clients"""
    print("🧪 Testing WebSocket message relay between MCP and browser")
    print("=" * 60)
    
    # Start listener in background
    listener_task = asyncio.create_task(websocket_listener())
    
    # Wait a moment for listener to connect
    await asyncio.sleep(2)
    
    # Send MCP append
    mcp_success = await mcp_append_test()
    print(f"🔍 DEBUG: mcp_success = {mcp_success}")
    
    # Wait for listener to receive update (with timeout)
    try:
        listener_success = await asyncio.wait_for(listener_task, timeout=10.0)
        print(f"🔍 DEBUG: listener_success = {listener_success}")
        
        if mcp_success and listener_success:
            print("\n✅ SUCCESS: MCP changes are being relayed to browser clients!")
        elif mcp_success and not listener_success:
            print("\n⚠️ PARTIAL: MCP append works but changes not relayed to browser")
        else:
            print("\n❌ FAILED: MCP append failed")
            print(f"   🔍 mcp_success={mcp_success}, listener_success={listener_success}")
            
    except asyncio.TimeoutError:
        print("\n⏰ TIMEOUT: No update received by browser client within 10 seconds")
        print("❌ MCP changes are NOT being relayed to browser clients")
        listener_task.cancel()

if __name__ == "__main__":
    asyncio.run(test_websocket_relay())
