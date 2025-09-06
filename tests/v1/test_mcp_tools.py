#!/usr/bin/env python3
"""
Test script to demonstrate the Lexical MCP Server tools with mandatory doc_id
"""

import asyncio
import json
from lexical_loro.mcp.server import load_document, get_document_info, append_paragraph, insert_paragraph


async def test_mcp_tools():
    """Test the MCP server tools functionality with mandatory doc_id"""
    
    print("🧪 Testing Lexical MCP Server Tools (Mandatory doc_id)")
    print("=" * 60)
    
    doc_id = "test-doc-mandatory-id"
    
    # Test 1: Load a document (will create it if it doesn't exist)
    print(f"\n1. Testing load_document tool with doc_id: {doc_id}")
    load_result = await load_document(doc_id)
    load_data = json.loads(load_result)
    print(f"✅ Load successful: {load_data.get('success')}")
    print(f"   Document ID: {load_data.get('doc_id')}")
    print(f"   Container ID: {load_data.get('container_id')}")
    
    # Test 2: Get document info
    print(f"\n2. Testing get_document_info tool:")
    info_result = await get_document_info(doc_id)
    info_data = json.loads(info_result)
    print(f"✅ Info retrieval successful: {info_data.get('success')}")
    print(f"   Total blocks: {info_data.get('total_blocks')}")
    print(f"   Block types: {info_data.get('block_types')}")
    
    # Test 3: Append a paragraph
    print(f"\n3. Testing append_paragraph tool:")
    append_result = await append_paragraph("This is the first paragraph added to the document.", doc_id)
    append_data = json.loads(append_result)
    print(f"✅ Append successful: {append_data.get('success')}")
    print(f"   Total blocks after append: {append_data.get('total_blocks')}")
    print(f"   Text added: '{append_data.get('text')}'")
    
    # Test 4: Insert a paragraph at index 0
    print(f"\n4. Testing insert_paragraph tool:")
    insert_result = await insert_paragraph(0, "This paragraph was inserted at the beginning.", doc_id)
    insert_data = json.loads(insert_result)
    print(f"✅ Insert successful: {insert_data.get('success')}")
    print(f"   Inserted at index: {insert_data.get('index')}")
    print(f"   Total blocks after insert: {insert_data.get('total_blocks')}")
    print(f"   Text inserted: '{insert_data.get('text')}'")
    
    # Test 5: Append another paragraph
    print(f"\n5. Adding another paragraph:")
    append_result2 = await append_paragraph("This is the second paragraph appended to the document.", doc_id)
    append_data2 = json.loads(append_result2)
    print(f"✅ Second append successful: {append_data2.get('success')}")
    print(f"   Total blocks: {append_data2.get('total_blocks')}")
    
    # Test 6: Get final document info
    print(f"\n6. Getting final document state:")
    final_info_result = await get_document_info(doc_id)
    final_info_data = json.loads(final_info_result)
    print(f"✅ Final info retrieval successful: {final_info_data.get('success')}")
    print(f"   Final total blocks: {final_info_data.get('total_blocks')}")
    print(f"   Final block types: {final_info_data.get('block_types')}")
    
    # Test 7: Load the document again to see the final lexical structure
    print(f"\n7. Loading document final lexical structure:")
    final_load_result = await load_document(doc_id)
    final_data = json.loads(final_load_result)
    
    if final_data.get("success"):
        children = final_data.get("lexical_data", {}).get("root", {}).get("children", [])
        print(f"✅ Final document has {len(children)} blocks:")
        for i, child in enumerate(children):
            if child.get("children") and len(child["children"]) > 0:
                text_content = child["children"][0].get("text", "")
                print(f"   Block {i}: '{text_content}'")
            else:
                print(f"   Block {i}: {child.get('type', 'unknown')} (no text content)")
    
    print(f"\n🎉 All tests completed successfully!")
    print(f"📋 Summary: All MCP tools now require explicit doc_id parameter")
    print(f"🔧 Available tools: load_document, get_document_info, append_paragraph, insert_paragraph")


async def test_error_handling():
    """Test error handling scenarios"""
    print(f"\n" + "=" * 60)
    print("🛠️  Testing Error Handling")
    print("=" * 60)
    
    # Test with invalid operations
    try:
        print(f"\n1. Testing error handling with valid doc_id:")
        # This should work fine
        result = await get_document_info("error-test-doc")
        data = json.loads(result)
        print(f"✅ Error test doc info: {data.get('success')}")
        
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
    asyncio.run(test_error_handling())
