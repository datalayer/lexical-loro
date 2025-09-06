#!/usr/bin/env python3
"""
Test insert_paragraph functionality with existing running server
"""

import asyncio
import json
import sys
import os

# Add the lexical_loro package to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lexical_loro.model.lexical_model import LexicalDocumentManager


async def test_insert_paragraph_direct():
    """Test insert_paragraph directly with the model."""
    print("🧪 Testing insert_paragraph with SAFE incremental updates (Direct)")
    print("=" * 60)
    
    try:
        # Create document manager
        print("🚀 Creating document manager...")
        manager = LexicalDocumentManager(
            websocket_url="ws://localhost:8081",
            client_mode=True
        )
        
        # Connect to WebSocket server
        print("🔌 Connecting to WebSocket server...")
        await manager._ensure_connected()
        await asyncio.sleep(1)  # Let connection stabilize
        
        # Get or create test document
        print("📄 Getting test document...")
        doc_id = "test-insert-direct"
        model = manager.get_or_create_document(doc_id)
        
        # Add some initial content first
        print("\n➕ Adding initial content...")
        for i in range(4):
            result = await model.append_block({"text": f"Initial paragraph {i+1}"}, "paragraph")
            print(f"   📄 Added paragraph {i+1}: {result.get('success', False)}")
            await asyncio.sleep(0.2)  # Brief delay between operations
        
        # Get current state
        print(f"\n📊 Document state before insert:")
        lexical_data = model.get_lexical_data()
        blocks = lexical_data.get("root", {}).get("children", [])
        print(f"   Total blocks: {len(blocks)}")
        for i, block in enumerate(blocks):
            if block.get('children') and len(block['children']) > 0:
                text = block['children'][0].get('text', '(no text)')
                print(f"   {i}: {text}")
        
        # Now test insert at index 2 (hardcoded as requested)
        print(f"\n🔧 Testing insert_paragraph at index 2...")
        insert_result = await model.add_block_at_index(
            2, 
            {"text": "🧪 INSERTED at index 2 - This should appear between paragraph 2 and 3!"}, 
            "paragraph"
        )
        
        print(f"📋 Insert result: {insert_result}")
        
        if insert_result.get('success'):
            print(f"✅ SUCCESS: insert_paragraph completed!")
            print(f"   📊 Blocks before: {insert_result.get('blocks_before')}")
            print(f"   📊 Blocks after: {insert_result.get('blocks_after')}")
            print(f"   📍 Inserted at index: {insert_result.get('inserted_at_index')}")
        else:
            print(f"❌ FAILURE: Insert operation failed")
        
        # Wait a moment for updates to propagate
        await asyncio.sleep(1)
        
        # Get final document state
        print(f"\n📄 Final document state:")
        lexical_data = model.get_lexical_data()
        blocks = lexical_data.get("root", {}).get("children", [])
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
                print(f"✅ The insert_paragraph function is working with SAFE incremental updates!")
                return True
            else:
                print(f"\n❌ FAILURE: Insert didn't place text at correct index")
                print(f"   Expected at index 2, but found: '{inserted_text}'")
        else:
            print(f"\n❌ FAILURE: Not enough blocks in final document")
            
    except Exception as e:
        print(f"❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return False


if __name__ == "__main__":
    success = asyncio.run(test_insert_paragraph_direct())
    if success:
        print(f"\n🎉 All tests passed! insert_paragraph is ready for use.")
    else:
        print(f"\n❌ Tests failed.")
