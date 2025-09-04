#!/usr/bin/env python3

"""
Test script to verify that insert_paragraph fix is working
"""

import asyncio
import json
import websockets
import time

DOC_ID = "test-doc"
WS_URL = f"ws://localhost:8081/{DOC_ID}"

async def test_insert_paragraph():
    """Test insert_paragraph functionality"""
    print(f"🧪 Connecting to {WS_URL}")
    
    try:
        async with websockets.connect(WS_URL) as websocket:
            print("✅ Connected to WebSocket")
            
            # First, append a few paragraphs to have content to insert between
            print("\n📝 Setting up test content...")
            
            append_messages = [
                {"type": "append-paragraph", "docId": DOC_ID, "message": "First paragraph"},
                {"type": "append-paragraph", "docId": DOC_ID, "message": "Second paragraph"},
                {"type": "append-paragraph", "docId": DOC_ID, "message": "Third paragraph"}
            ]
            
            for i, msg in enumerate(append_messages):
                print(f"   Sending: {msg['message']}")
                await websocket.send(json.dumps(msg))
                await asyncio.sleep(0.5)  # Brief pause between messages
            
            print("\n🎯 Now testing insert at index 1...")
            
            # Now test insert at index 1 (should go between "First" and "Second")
            insert_msg = {
                "type": "insert-paragraph",
                "docId": DOC_ID,
                "index": 1,
                "message": "INSERTED at index 1"
            }
            
            print(f"   Sending: {insert_msg}")
            await websocket.send(json.dumps(insert_msg))
            
            # Wait a moment for processing
            await asyncio.sleep(1.0)
            
            # Request final snapshot to see the result
            print("\n📋 Requesting final document snapshot...")
            snapshot_request = {
                "type": "snapshot",
                "docId": DOC_ID
            }
            await websocket.send(json.dumps(snapshot_request))
            
            # Listen for responses
            print("\n📡 Listening for responses...")
            response_count = 0
            
            async for message in websocket:
                try:
                    data = json.loads(message)
                    msg_type = data.get("type", "unknown")
                    
                    if msg_type == "snapshot" or msg_type == "initial-snapshot":
                        snapshot_content = data.get("snapshot", data.get("content", ""))
                        print(f"📊 Received {msg_type} with {len(snapshot_content)} bytes")
                        # Parse the snapshot to see document structure
                        try:
                            # Handle different data types
                            if isinstance(snapshot_content, list):
                                # Convert list of bytes to string
                                snapshot_str = bytes(snapshot_content).decode('utf-8')
                                snapshot_data = json.loads(snapshot_str)
                            elif isinstance(snapshot_content, str):
                                snapshot_data = json.loads(snapshot_content)
                            else:
                                snapshot_data = snapshot_content
                            
                            children = snapshot_data.get("root", {}).get("children", [])
                            print(f"📋 Document has {len(children)} blocks:")
                            for idx, child in enumerate(children):
                                text_nodes = child.get("children", [])
                                if text_nodes and text_nodes[0].get("type") == "text":
                                    text = text_nodes[0].get("text", "")
                                    print(f"   {idx}: {text}")
                        except Exception as parse_error:
                            print(f"⚠️ Could not parse snapshot: {parse_error}")
                            print(f"    Raw data type: {type(snapshot_content)}")
                            if isinstance(snapshot_content, list) and len(snapshot_content) > 0:
                                try:
                                    # Try to decode first few bytes for preview
                                    preview = bytes(snapshot_content[:50]).decode('utf-8', errors='ignore')
                                    print(f"    Raw data preview: {preview}...")
                                except:
                                    print(f"    Raw data length: {len(snapshot_content)} items")
                    
                    elif msg_type == "document-update":
                        print(f"🔄 Document update received")
                        # Check if there's snapshot data in the update
                        if "snapshot" in data or "content" in data:
                            snapshot_content = data.get("snapshot", data.get("content", ""))
                            try:
                                if isinstance(snapshot_content, str):
                                    snapshot_data = json.loads(snapshot_content)
                                else:
                                    snapshot_data = snapshot_content
                                
                                children = snapshot_data.get("root", {}).get("children", [])
                                print(f"   Updated document has {len(children)} blocks:")
                                for idx, child in enumerate(children):
                                    text_nodes = child.get("children", [])
                                    if text_nodes and text_nodes[0].get("type") == "text":
                                        text = text_nodes[0].get("text", "")
                                        print(f"      {idx}: {text}")
                            except Exception as parse_error:
                                print(f"   ⚠️ Could not parse update content: {parse_error}")
                    
                    elif msg_type == "error":
                        print(f"❌ Error: {data.get('message', 'Unknown error')}")
                    
                    else:
                        print(f"📨 Received: {msg_type}")
                        # Show any other content for debugging
                        if len(str(data)) < 200:
                            print(f"    Data: {data}")
                    
                    response_count += 1
                    if response_count >= 15:  # Stop after reasonable number of responses
                        break
                        
                except json.JSONDecodeError:
                    print(f"⚠️ Non-JSON message: {message[:100]}...")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
                    
    except ConnectionRefusedError:
        print("❌ Connection refused - is the WebSocket server running?")
        print("   Start with: python -m lexical_loro.server")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🚀 Testing insert_paragraph fix...")
    asyncio.run(test_insert_paragraph())
