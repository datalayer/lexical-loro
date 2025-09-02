#!/usr/bin/env python3
"""
Test insert_paragraph functionality with the new SAFE implementation
"""

import asyncio
import websockets
import json
import time
import threading
from lexical_loro.server import main as run_server


async def test_insert_paragraph():
    """Test insert_paragraph MCP tool with incremental updates."""
    print("🧪 Testing insert_paragraph with SAFE incremental updates")
    print("=" * 60)
    
    # Start server in background thread
    server_thread = threading.Thread(target=lambda: asyncio.run(run_server()), daemon=True)
    server_thread.start()
    
    # Wait for server to start
    print("⏱️ Waiting for server to initialize...")
    await asyncio.sleep(2)
    
    try:
        # Connect to MCP server
        mcp_url = "http://localhost:8080/sse"
        
        # Test the insert_paragraph tool via MCP
        import httpx
        
        # Set current document
        print("📝 Setting current document...")
        set_doc_payload = {
            "method": "tools/call",
            "params": {
                "name": "set_current_document",
                "arguments": {"doc_id": "test-insert-doc"}
            }
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(mcp_url, json=set_doc_payload)
            print(f"✅ Set document response: {response.status_code}")
            
            # Add some initial content first
            print("\n➕ Adding initial content...")
            for i in range(4):
                append_payload = {
                    "method": "tools/call", 
                    "params": {
                        "name": "append_paragraph",
                        "arguments": {
                            "doc_id": "test-insert-doc",
                            "text": f"Initial paragraph {i+1}"
                        }
                    }
                }
                response = await client.post(mcp_url, json=append_payload)
                result = response.json()
                print(f"   📄 Added paragraph {i+1}: {result.get('result', {}).get('success', False)}")
                await asyncio.sleep(0.2)  # Brief delay between operations
            
            # Now test insert at index 2 (hardcoded as requested)
            print(f"\n🔧 Testing insert_paragraph at index 2...")
            insert_payload = {
                "method": "tools/call",
                "params": {
                    "name": "insert_paragraph", 
                    "arguments": {
                        "doc_id": "test-insert-doc",
                        "index": 2,
                        "text": "🧪 INSERTED at index 2 - This should appear between paragraph 2 and 3!"
                    }
                }
            }
            
            response = await client.post(mcp_url, json=insert_payload)
            result = response.json()
            
            print(f"📤 Insert response status: {response.status_code}")
            print(f"📋 Insert result: {json.dumps(result, indent=2)}")
            
            if result.get('result'):
                parsed_result = json.loads(result['result'])
                if parsed_result.get('success'):
                    print(f"✅ SUCCESS: insert_paragraph completed!")
                    print(f"   📊 Total blocks: {parsed_result.get('total_blocks')}")
                    print(f"   📍 Inserted at index: {parsed_result.get('index')}")
                    print(f"   📝 Text: {parsed_result.get('text')}")
                else:
                    print(f"❌ FAILURE: {parsed_result.get('error')}")
            
            # Get final document state
            print(f"\n📄 Getting final document state...")
            get_doc_payload = {
                "method": "tools/call",
                "params": {
                    "name": "get_document_data",
                    "arguments": {"doc_id": "test-insert-doc"}
                }
            }
            
            response = await client.post(mcp_url, json=get_doc_payload)
            doc_result = response.json()
            
            if doc_result.get('result'):
                doc_data = json.loads(doc_result['result'])
                if doc_data.get('success'):
                    blocks = doc_data.get('lexical_data', {}).get('root', {}).get('children', [])
                    print(f"📊 Final document has {len(blocks)} blocks:")
                    for i, block in enumerate(blocks):
                        if block.get('children') and len(block['children']) > 0:
                            text = block['children'][0].get('text', '(no text)')
                            print(f"   {i}: {text}")
                    
                    # Verify insert worked correctly
                    if len(blocks) >= 3:
                        inserted_text = blocks[2].get('children', [{}])[0].get('text', '')
                        if "INSERTED at index 2" in inserted_text:
                            print(f"\n🎉 SUCCESS: Insert paragraph worked correctly!")
                            print(f"✅ Text inserted at index 2: '{inserted_text}'")
                        else:
                            print(f"\n❌ FAILURE: Insert didn't place text at correct index")
                            print(f"   Expected at index 2, but found: '{inserted_text}'")
                    else:
                        print(f"\n❌ FAILURE: Not enough blocks in final document")
                        
    except Exception as e:
        print(f"❌ Test error: {e}")
        return False
    
    print(f"\n✅ Insert paragraph test completed")
    return True


if __name__ == "__main__":
    asyncio.run(test_insert_paragraph())
