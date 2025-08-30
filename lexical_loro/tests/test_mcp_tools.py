#!/usr/bin/env python3
"""
Test script to demonstrate the Lexical MCP Server tools
"""

import asyncio
import json
from lexical_loro.mcp.server import LexicalMCPServer


async def test_mcp_tools():
    """Test the MCP server tools functionality"""
    
    # Create a server instance
    server = LexicalMCPServer()
    
    print("🧪 Testing Lexical MCP Server Tools")
    print("=" * 50)
    
    # Test 1: Load a document (will create it if it doesn't exist)
    print("\n1. Testing load_document tool:")
    load_result = await server._load_document({"doc_id": "test-doc-1"})
    print(f"Load result: {load_result[0].text}")
    
    # Test 2: Append a paragraph
    print("\n2. Testing append_paragraph tool:")
    append_result = await server._append_paragraph({
        "doc_id": "test-doc-1",
        "text": "This is the first paragraph added to the document."
    })
    print(f"Append result: {append_result[0].text}")
    
    # Test 3: Insert a paragraph at index 0
    print("\n3. Testing insert_paragraph tool:")
    insert_result = await server._insert_paragraph({
        "doc_id": "test-doc-1",
        "index": 0,
        "text": "This paragraph was inserted at the beginning."
    })
    print(f"Insert result: {insert_result[0].text}")
    
    # Test 4: Append another paragraph
    print("\n4. Adding another paragraph:")
    append_result2 = await server._append_paragraph({
        "doc_id": "test-doc-1",
        "text": "This is the second paragraph appended to the document."
    })
    print(f"Second append result: {append_result2[0].text}")
    
    # Test 5: Load the document again to see the final state
    print("\n5. Loading document final state:")
    final_load_result = await server._load_document({"doc_id": "test-doc-1"})
    final_data = json.loads(final_load_result[0].text)
    
    if final_data.get("success"):
        children = final_data.get("lexical_data", {}).get("root", {}).get("children", [])
        print(f"Final document has {len(children)} blocks:")
        for i, child in enumerate(children):
            if child.get("children") and len(child["children"]) > 0:
                text_content = child["children"][0].get("text", "")
                print(f"  Block {i}: {text_content}")
    
    print("\n✅ All tests completed!")


if __name__ == "__main__":
    asyncio.run(test_mcp_tools())
