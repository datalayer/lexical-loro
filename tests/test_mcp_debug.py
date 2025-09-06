#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Debug script to test MCP append paragraph flow with comprehensive logging.
This reproduces the issue where MCP operations fail on first attempt.
"""
import asyncio
import json
from lexical_loro.model.document_manager import LexicalDocumentManager

async def test_mcp_append_flow():
    """Test the full MCP append paragraph message flow."""
    print("🧪 TESTING MCP APPEND PARAGRAPH FLOW")
    print("=" * 50)
    print()
    
    # Step 1: Create document manager
    print("📋 Step 1: Creating document manager...")
    manager = LexicalDocumentManager()
    
    # Step 2: Get document
    print()
    print("📋 Step 2: Getting document 'test-mcp-debug'...")
    doc_model = await manager.get_document('test-mcp-debug')
    print(f"📊 Initial blocks: {doc_model.get_block_count()}")
    initial_data = doc_model.get_lexical_data()
    print(f"📊 Initial lexical_data: {json.dumps(initial_data, indent=2)}")
    
    # Step 3: Test append_paragraph via message handler
    print()
    print("📋 Step 3: Calling append_paragraph via message handler...")
    message_data = {
        'message': 'Test paragraph from MCP debug script',
        'position': 'end'
    }
    print(f"🔍 Message data: {message_data}")
    
    try:
        result = await manager.handle_message(
            message_type='append-paragraph',
            doc_id='test-mcp-debug',
            data=message_data
        )
        print(f"✅ Message handler result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"❌ Message handler error: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 4: Check state after append
    print()
    print("📋 Step 4: Checking state after append...")
    blocks_after = doc_model.get_block_count()
    print(f"📊 Blocks after append: {blocks_after}")
    print(f"📊 Block count change: {initial_data['root']['children'].__len__()} -> {blocks_after}")
    
    if blocks_after > len(initial_data['root']['children']):
        print("✅ Block was added successfully!")
        final_data = doc_model.get_lexical_data()
        new_block = final_data['root']['children'][-1]  # Last added block
        print(f"📝 New block: {json.dumps(new_block, indent=2)}")
    else:
        print("❌ No block was added!")
        return
    
    # Step 5: Check CRDT state
    print()
    print("📋 Step 5: Checking CRDT state...")
    content = doc_model.loro_model.get_content()
    print(f"📊 CRDT content length: {len(content)}")
    print(f"📊 CRDT content preview: {content[:200]}...")
    
    # Parse CRDT content to check blocks
    try:
        crdt_data = json.loads(content)
        crdt_blocks = len(crdt_data.get('root', {}).get('children', []))
        print(f"📊 CRDT blocks: {crdt_blocks}")
        
        if crdt_blocks == blocks_after:
            print("✅ SYNC OK: Both lexical_data and CRDT have the same block count")
        else:
            print(f"❌ SYNC ISSUE: lexical_data has {blocks_after} blocks, CRDT has {crdt_blocks}")
    except Exception as e:
        print(f"⚠️ Could not parse CRDT content: {e}")
    
    # Step 6: Test a second append to verify repeatability
    print()
    print("📋 Step 6: Calling append_paragraph AGAIN to test repetition...")
    second_message_data = {
        'message': 'Second test paragraph from MCP debug script',
        'position': 'end'
    }
    print(f"🔍 Second message data: {second_message_data}")
    
    try:
        second_result = await manager.handle_message(
            message_type='append-paragraph',
            doc_id='test-mcp-debug',
            data=second_message_data
        )
        print(f"✅ Second message handler result: {json.dumps(second_result, indent=2)}")
        
        final_blocks = doc_model.get_block_count()
        print(f"📊 Final blocks: {final_blocks}")
        print(f"📊 Block progression: {len(initial_data['root']['children'])} -> {blocks_after} -> {final_blocks}")
        
        if final_blocks > blocks_after:
            print("✅ Second block was added successfully!")
        else:
            print("❌ Second block was not added!")
            
    except Exception as e:
        print(f"❌ Second message handler error: {e}")
        import traceback
        traceback.print_exc()
    
    # Step 7: Final state summary
    print()
    print("📋 Step 7: Final state summary...")
    final_lexical_data = doc_model.get_lexical_data()
    final_block_count = len(final_lexical_data['root']['children'])
    print(f"📊 Final lexical_data blocks: {final_block_count}")
    
    print()
    print("🧪 TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_mcp_append_flow())
