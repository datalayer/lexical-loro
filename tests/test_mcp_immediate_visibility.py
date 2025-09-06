#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script to verify MCP operations now work immediately without requiring a second operation.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import asyncio
import json
from lexical_loro.model.lexical_model import LexicalDocumentManager

async def test_immediate_mcp_visibility():
    """Test that MCP operations are immediately visible without needing a second operation."""
    print("🧪 TESTING IMMEDIATE MCP VISIBILITY")
    print("=" * 50)
    print()
    
    # Create document manager  
    print("📋 Step 1: Creating document manager...")
    manager = LexicalDocumentManager()
    
    # Get fresh document
    print()
    print("📋 Step 2: Getting fresh document 'test-immediate'...")
    doc_model = manager.get_or_create_document('test-immediate')
    initial_blocks = len(doc_model.get_blocks())
    print(f"📊 Initial blocks: {initial_blocks}")
    
    # First MCP operation
    print()
    print("📋 Step 3: Performing FIRST MCP operation...")
    message_data = {
        'message': 'First paragraph - should be immediately visible',
        'position': 'end'
    }
    
    result1 = await manager.handle_message(
        doc_id='test-immediate',
        message_type='append-paragraph', 
        data=message_data
    )
    
    # Check immediately after first operation
    blocks_after_first = len(doc_model.get_blocks())
    print(f"📊 Blocks after FIRST operation: {blocks_after_first}")
    print(f"📊 Change: {initial_blocks} -> {blocks_after_first}")
    
    if blocks_after_first > initial_blocks:
        print("✅ FIRST operation is immediately visible!")
    else:
        print("❌ FIRST operation is NOT immediately visible!")
        
    # Get the actual content to verify
    lexical_data = doc_model.get_lexical_data()
    children = lexical_data.get("root", {}).get("children", [])
    if children:
        first_block_text = children[-1].get("children", [{}])[0].get("text", "NO TEXT")
        print(f"📝 First block text: '{first_block_text}'")
    
    # Small delay to simulate UI processing time
    await asyncio.sleep(0.2)
    
    # Second MCP operation
    print()
    print("📋 Step 4: Performing SECOND MCP operation...")
    message_data2 = {
        'message': 'Second paragraph - testing consistency',
        'position': 'end'
    }
    
    result2 = await manager.handle_message(
        doc_id='test-immediate',
        message_type='append-paragraph',
        data=message_data2
    )
    
    # Check after second operation
    blocks_after_second = len(doc_model.get_blocks())
    print(f"📊 Blocks after SECOND operation: {blocks_after_second}")
    print(f"📊 Full progression: {initial_blocks} -> {blocks_after_first} -> {blocks_after_second}")
    
    if blocks_after_second > blocks_after_first:
        print("✅ SECOND operation is also immediately visible!")
    else:
        print("❌ SECOND operation is NOT immediately visible!")
    
    # Final verification
    final_lexical_data = doc_model.get_lexical_data()
    final_children = final_lexical_data.get("root", {}).get("children", [])
    print(f"📊 Final block count: {len(final_children)}")
    
    if len(final_children) >= 2:
        print("✅ Both operations succeeded and are visible!")
        for i, child in enumerate(final_children):
            text = child.get("children", [{}])[0].get("text", "NO TEXT")
            print(f"  Block {i+1}: '{text}'")
    else:
        print("❌ Not all operations are visible!")
    
    print()
    print("🧪 TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_immediate_mcp_visibility())
