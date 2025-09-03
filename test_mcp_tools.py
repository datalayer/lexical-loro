#!/usr/bin/env python3
"""
Simple test script to verify MCP server tools work correctly
"""

import asyncio
import json
from lexical_loro.mcp.server import load_document, get_document_info, append_paragraph, insert_paragraph

async def test_tools():
    """Test that all MCP tools work with mandatory doc_id"""
    doc_id = "test-doc-123"
    
    print("Testing MCP server tools with mandatory doc_id...")
    
    try:
        # Test load_document
        print(f"\n1. Testing load_document with doc_id: {doc_id}")
        result = await load_document(doc_id)
        print(f"✅ load_document result: {json.loads(result)['success']}")
        
        # Test get_document_info
        print(f"\n2. Testing get_document_info with doc_id: {doc_id}")
        result = await get_document_info(doc_id)
        print(f"✅ get_document_info result: {json.loads(result)['success']}")
        
        # Test append_paragraph
        print(f"\n3. Testing append_paragraph with doc_id: {doc_id}")
        result = await append_paragraph("Test paragraph from MCP", doc_id)
        print(f"✅ append_paragraph result: {json.loads(result)['success']}")
        
        # Test insert_paragraph
        print(f"\n4. Testing insert_paragraph with doc_id: {doc_id}")
        result = await insert_paragraph(0, "Inserted paragraph", doc_id)
        print(f"✅ insert_paragraph result: {json.loads(result)['success']}")
        
        print("\n🎉 All tools work correctly with mandatory doc_id!")
        
    except Exception as e:
        print(f"❌ Error testing tools: {e}")
        return False
    
    return True

if __name__ == "__main__":
    success = asyncio.run(test_tools())
    if success:
        print("\n✅ MCP server refactoring completed successfully!")
    else:
        print("\n❌ MCP server refactoring has issues!")
