#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test the actual MCP server endpoints to debug the three specific issues
"""

import asyncio
import logging
from lexical_loro.model import LexicalDocumentManager
from lexical_loro.mcp.server import document_manager

# Set up logging to see what's happening
logging.basicConfig(level=logging.DEBUG)

async def test_mcp_endpoints():
    """Test the actual MCP server endpoints that are causing issues"""
    print("🔧 TESTING ACTUAL MCP ENDPOINTS")
    print("=" * 50)
    
    # Initialize global document manager (simulating server startup)
    import lexical_loro.mcp.server as server_module
    server_module.document_manager = LexicalDocumentManager()
    
    doc_id = "test-mcp-endpoints"
    
    # Import the actual MCP functions
    from lexical_loro.mcp.server import append_paragraph, insert_paragraph
    
    print(f"\n📋 Testing with document: {doc_id}")
    print("-" * 30)
    
    # Test 1: Append Paragraph (Issue 3: doesn't work)
    print("\n📝 Test 1: Append Paragraph")
    print("-" * 25)
    
    try:
        append_result = await append_paragraph("Test append paragraph", doc_id)
        print(f"Append result: {append_result}")
        
        # Check if document was actually modified
        model = server_module.document_manager.get_or_create_document(doc_id)
        lexical_data = model.get_lexical_data()
        blocks = lexical_data.get("root", {}).get("children", [])
        print(f"Blocks after append: {len(blocks)}")
        
        if len(blocks) > 0:
            text = blocks[-1].get("children", [{}])[0].get("text", "NO TEXT")
            print(f"Last block text: '{text}'")
            if "Test append paragraph" in text:
                print("✅ Append paragraph WORKED!")
            else:
                print("❌ Append paragraph FAILED - text not found!")
        else:
            print("❌ Append paragraph FAILED - no blocks found!")
            
    except Exception as e:
        print(f"❌ Append paragraph ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: Insert at Index 2 (Issues 1 & 2: shows JSON, needs typing)
    print("\n📝 Test 2: Insert at Index 2")
    print("-" * 25)
    
    # First add some content to ensure we can insert at index 2
    try:
        for i in range(3):
            await append_paragraph(f"Filler block {i+1}", doc_id)
        
        model = server_module.document_manager.get_or_create_document(doc_id)
        lexical_data = model.get_lexical_data()
        blocks_before = len(lexical_data.get("root", {}).get("children", []))
        print(f"Blocks before insert: {blocks_before}")
        
        # Now test insert at index 2
        insert_result = await insert_paragraph(2, "Inserted at index 2", doc_id)
        print(f"Insert result: {insert_result}")
        
        # Check if it actually inserted
        lexical_data = model.get_lexical_data()
        blocks_after = len(lexical_data.get("root", {}).get("children", []))
        print(f"Blocks after insert: {blocks_after}")
        
        if blocks_after > blocks_before:
            blocks = lexical_data.get("root", {}).get("children", [])
            if len(blocks) > 2:
                text = blocks[2].get("children", [{}])[0].get("text", "NO TEXT")
                print(f"Text at index 2: '{text}'")
                if "Inserted at index 2" in text:
                    print("✅ Insert at index 2 WORKED!")
                else:
                    print("❌ Insert at index 2 FAILED - wrong text!")
            else:
                print("❌ Insert at index 2 FAILED - not enough blocks!")
        else:
            print("❌ Insert at index 2 FAILED - block count didn't increase!")
            
    except Exception as e:
        print(f"❌ Insert at index 2 ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 3: Show final document state
    print("\n📝 Test 3: Final Document State")
    print("-" * 30)
    
    try:
        model = server_module.document_manager.get_or_create_document(doc_id)
        lexical_data = model.get_lexical_data()
        blocks = lexical_data.get("root", {}).get("children", [])
        
        print(f"Final document has {len(blocks)} blocks:")
        for i, block in enumerate(blocks):
            text = block.get("children", [{}])[0].get("text", "NO TEXT")
            print(f"  Block {i}: '{text}'")
            
    except Exception as e:
        print(f"❌ Final state ERROR: {e}")
    
    print("\n🔧 MCP ENDPOINT TESTING COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_mcp_endpoints())
