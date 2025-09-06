#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


import asyncio
import websockets
import json

async def test_websocket_with_docid():
    """Test WebSocket connection with document ID in path"""
    try:
        # Connect to WebSocket server with document ID
        doc_id = "example-1"
        uri = f"ws://127.0.0.1:8081/{doc_id}"
        print(f"🔌 Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to WebSocket server with document ID")
            
            # Send an append message first to establish some content
            append_message = {
                "type": "append-paragraph",
                "docId": doc_id,
                "message": "Test paragraph - checking insert functionality"
            }
            
            print(f"📤 Sending append message: {append_message}")
            await websocket.send(json.dumps(append_message))
            
            # Wait a moment
            await asyncio.sleep(0.5)
            
            # Now send the insert message at index 1
            insert_message = {
                "type": "insert-paragraph", 
                "docId": doc_id,
                "message": "🚀 INSERTED at index 1 - This should appear BEFORE the test paragraph!",
                "index": 1
            }
            
            print(f"📤 Sending insert message: {insert_message}")
            await websocket.send(json.dumps(insert_message))
            
            # Wait for any responses
            print("📨 Listening for responses...")
            try:
                while True:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2.0)
                    print(f"📨 Received: {response}")
                    
                    try:
                        response_data = json.loads(response)
                        if response_data.get("type") == "lexical-state":
                            print("🎯 Received lexical state update!")
                            root = response_data.get("data", {}).get("root", {})
                            children = root.get("children", [])
                            paragraphs = [child for child in children if child.get("type") == "paragraph"]
                            print(f"📊 Document now has {len(paragraphs)} paragraphs:")
                            
                            for i, para in enumerate(paragraphs):
                                if "children" in para and para["children"]:
                                    text_content = ""
                                    for text_node in para["children"]:
                                        if text_node.get("type") == "text":
                                            text_content += text_node.get("text", "")
                                    print(f"  Paragraph {i}: {text_content[:60]}...")
                                else:
                                    print(f"  Paragraph {i}: [empty]")
                            
                    except json.JSONDecodeError:
                        print(f"📄 Raw response: {response}")
                        
            except asyncio.TimeoutError:
                print("⏰ No more responses")
                print("✅ Test completed - check the frontend to see if the insert worked!")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_websocket_with_docid())
