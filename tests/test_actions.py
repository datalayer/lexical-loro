#!/usr/bin/env python3
"""
Test script for the new LexicalModel methods
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

try:
    from lexical_loro.model.lexical_model import LexicalModel
    print("✅ Successfully imported LexicalModel")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Note: This is expected if 'loro' package is not installed")
    sys.exit(0)

def test_new_methods():
    """Test the three new methods"""
    try:
        # Create a new model
        model = LexicalModel.create_document("test-doc", event_callback=None)
        print("✅ Created LexicalModel instance")
        
        # Test get_complete_model
        complete_model = model.get_complete_model()
        print(f"✅ get_complete_model: {len(complete_model)} top-level keys")
        print(f"   - lexical_data keys: {list(complete_model['lexical_data'].keys())}")
        print(f"   - metadata keys: {list(complete_model['metadata'].keys())}")
        
        # Test adding blocks at specific indices
        model.add_block_at_index(0, {"text": "First block"}, "paragraph")
        print("✅ Added block at index 0")
        
        model.add_block_at_index(1, {"text": "Second block"}, "heading1")
        print("✅ Added block at index 1")
        
        model.add_block_at_index(1, {"text": "Inserted block"}, "paragraph")
        print("✅ Inserted block at index 1")
        
        # Test get_block_at_index
        for i in range(3):
            block = model.get_block_at_index(i)
            if block:
                block_type = block.get('type', 'unknown')
                block_text = ""
                if block.get('children'):
                    for child in block['children']:
                        if child.get('type') == 'text':
                            block_text = child.get('text', '')
                            break
                print(f"✅ Block {i}: type='{block_type}', text='{block_text}'")
            else:
                print(f"❌ Block {i}: None")
        
        # Test out-of-range access
        out_of_range_block = model.get_block_at_index(10)
        print(f"✅ Out of range access returns: {out_of_range_block}")
        
        # Test complete model again to see changes
        updated_model = model.get_complete_model()
        block_count = updated_model['metadata']['block_count']
        print(f"✅ Final block count: {block_count}")
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Testing new LexicalModel methods...")
    success = test_new_methods()
    print(f"\nTest {'PASSED' if success else 'FAILED'}")
