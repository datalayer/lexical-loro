#!/usr/bin/env python3
"""
Simple test for MCP operations to debug the specific issues mentioned.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import asyncio
import json
from lexical_loro.model.lexical_model import LexicalDocumentManager

async def test_mcp_operations():
    """Test the specific MCP issues mentioned by the user."""
    print("🔧 TESTING MCP OPERATIONS")
    print("=" * 50)
    
    # Create document manager
    manager = LexicalDocumentManager()
    
    # Test 1: Append Paragraph (reportedly not working)
    print("\n📋 Test 1: Append Paragraph")
    print("-" * 30)
    
    doc_model = manager.get_or_create_document('test-mcp-issues')
    initial_blocks = len(doc_model.get_blocks())
    print(f"📊 Initial blocks: {initial_blocks}")
    
    # Test append paragraph via handle_message (same as MCP server does)
    append_data = {
        "message": "Test append paragraph",
        "position": "end"
    }
    
    try:
        append_result = await manager.handle_message('test-mcp-issues', 'append-paragraph', append_data)
        print(f"✅ Append result: {append_result}")
        
        blocks_after_append = len(doc_model.get_blocks())
        print(f"📊 Blocks after append: {blocks_after_append}")
        
        if blocks_after_append > initial_blocks:
            print("✅ Append paragraph WORKED!")
        else:
            print("❌ Append paragraph FAILED!")
            
    except Exception as e:
        print(f"❌ Append paragraph ERROR: {e}")
    
    # Test 2: Insert at Index 2 (reportedly shows JSON directly)
    print("\n📋 Test 2: Insert at Index 2")
    print("-" * 30)
    
    current_blocks = len(doc_model.get_blocks())
    print(f"📊 Current blocks before insert: {current_blocks}")
    
    # Add some blocks first to ensure we can insert at index 2
    if current_blocks < 3:
        for i in range(3 - current_blocks):
            filler_data = {
                "message": f"Filler block {i+1}",
                "position": "end"
            }
            await manager.handle_message('test-mcp-issues', 'append-paragraph', filler_data)
    
    updated_blocks = len(doc_model.get_blocks())
    print(f"📊 Blocks after fillers: {updated_blocks}")
    
    # Test insert at index 2 via add_block_at_index (same as MCP server does)
    try:
        insert_result = await doc_model.add_block_at_index(2, {"text": "Inserted at index 2"}, "paragraph")
        print(f"✅ Insert result: {insert_result}")
        
        blocks_after_insert = len(doc_model.get_blocks())
        print(f"📊 Blocks after insert: {blocks_after_insert}")
        
        if blocks_after_insert > updated_blocks:
            print("✅ Insert at index 2 WORKED!")
            
            # Check if the text was inserted at the right place
            lexical_data = doc_model.get_lexical_data()
            children = lexical_data.get("root", {}).get("children", [])
            if len(children) > 2:
                inserted_text = children[2].get("children", [{}])[0].get("text", "NO TEXT")
                print(f"📝 Text at index 2: '{inserted_text}'")
                if "Inserted at index 2" in inserted_text:
                    print("✅ Text inserted at correct position!")
                else:
                    print("❌ Text not at expected position!")
        else:
            print("❌ Insert at index 2 FAILED!")
            
    except Exception as e:
        print(f"❌ Insert at index 2 ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 3: Show final state
    print("\n📋 Test 3: Final State")
    print("-" * 30)
    
    final_lexical_data = doc_model.get_lexical_data()
    final_children = final_lexical_data.get("root", {}).get("children", [])
    print(f"📊 Final block count: {len(final_children)}")
    
    for i, child in enumerate(final_children):
        text = child.get("children", [{}])[0].get("text", "NO TEXT")
        print(f"  Block {i}: '{text}'")
    
    print("\n🔧 TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_mcp_operations())
