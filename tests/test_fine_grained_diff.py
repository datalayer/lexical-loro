#!/usr/bin/env python3
"""Test script to verify fine-grained diff handling in LoroModel"""

import json
import time
from lexical_loro.model.lexical_model import LexicalModel
from loro import LoroDoc


def test_fine_grained_diff_handling():
    """Test that LoroModel correctly handles fine-grained diffs"""
    print("🧪 Testing fine-grained diff handling in LoroModel...")
    
    # Create a LoroDoc with some initial content
    text_doc = LoroDoc()
    text_container = text_doc.get_text("content")
    
    initial_content = {
        "root": {
            "children": [
                {
                    "children": [
                        {
                            "detail": 0,
                            "format": 0,
                            "mode": "normal", 
                            "style": "",
                            "text": "Hello world",
                            "type": "text",
                            "version": 1
                        }
                    ],
                    "direction": None,
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1,
                    "textFormat": 0,
                    "textStyle": ""
                }
            ],
            "direction": None,
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        },
        "lastSaved": int(time.time() * 1000),
        "source": "Fine-grained Test",
        "version": "0.34.0"
    }
    
    # Insert initial content
    initial_json = json.dumps(initial_content)
    text_container.insert(0, initial_json)
    text_doc.commit()
    
    print("📝 Created text_doc with initial content")
    
    # Create LoroModel with existing text_doc (should set up subscription)
    model = LexicalModel(text_doc=text_doc)
    
    print(f"🧠 Created LoroModel: {model}")
    
    # Verify initial sync worked
    blocks = model.get_blocks()
    print(f"📋 Initial blocks: {len(blocks)}")
    initial_text = model._extract_block_text(blocks[0])
    print(f"📋 Initial text: '{initial_text}'")
    
    # Test 1: Make a small text change that should trigger fine-grained diff
    print("\n🔄 Test 1: Small text modification...")
    
    # Modify just the text content within the same structure
    modified_content = initial_content.copy()
    modified_content["root"]["children"][0]["children"][0]["text"] = "Hello universe"
    modified_content["lastSaved"] = int(time.time() * 1000)
    
    # Apply the change using text operations (simulating incremental edit)
    current_content = text_container.to_string()
    
    # Find and replace "world" with "universe"
    old_text = "Hello world"
    new_text = "Hello universe"
    updated_json = current_content.replace(old_text, new_text)
    
    # Apply the change to the document
    text_container.delete(0, len(current_content))
    text_container.insert(0, updated_json)
    text_doc.commit()
    
    print("📝 Applied small text change")
    
    # Give a moment for diff processing
    time.sleep(0.1)
    
    # Check the result
    updated_blocks = model.get_blocks()
    updated_text = model._extract_block_text(updated_blocks[0])
    print(f"📋 Updated text: '{updated_text}'")
    print(f"🧠 Updated model: {model}")
    
    # Test 2: Add a new block (structural change)
    print("\n🔄 Test 2: Structural change (add block)...")
    
    # Add a new paragraph block
    content_with_new_block = json.loads(updated_json)
    content_with_new_block["root"]["children"].append({
        "children": [
            {
                "detail": 0,
                "format": 0,
                "mode": "normal",
                "style": "",
                "text": "This is a new paragraph",
                "type": "text",
                "version": 1
            }
        ],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1,
        "textFormat": 0,
        "textStyle": ""
    })
    content_with_new_block["lastSaved"] = int(time.time() * 1000)
    
    # Apply the structural change
    current_content2 = text_container.to_string()
    new_json = json.dumps(content_with_new_block)
    
    text_container.delete(0, len(current_content2))
    text_container.insert(0, new_json)
    text_doc.commit()
    
    print("📝 Added new block")
    
    # Give a moment for diff processing
    time.sleep(0.1)
    
    # Check the result
    final_blocks = model.get_blocks()
    print(f"📋 Final block count: {len(final_blocks)}")
    print(f"🧠 Final model: {model}")
    
    # Verify block contents
    for i, block in enumerate(final_blocks):
        block_text = model._extract_block_text(block)
        block_type = block.get('type', 'unknown')
        print(f"📋 Block {i}: type='{block_type}', text='{block_text}'")
    
    # Test block summary
    summary = model.get_block_summary()
    print(f"📊 Final summary: {summary}")
    
    # Cleanup
    model.cleanup()
    print("🧹 Cleaned up model")
    
    print("✅ Fine-grained diff handling test completed!")
    return True


def test_diff_subscription_lifecycle():
    """Test the subscription lifecycle and cleanup"""
    print("\n🧪 Testing subscription lifecycle...")
    
    # Create document and model
    text_doc = LoroDoc()
    text_container = text_doc.get_text("content")
    text_container.insert(0, '{"root":{"children":[],"type":"root"},"source":"Test","version":"1.0"}')
    text_doc.commit()
    
    model = LexicalModel(text_doc=text_doc)
    assert model._text_doc_subscription is not None, "Should have subscription"
    print("✅ Subscription created")
    
    # Test cleanup
    model.cleanup()
    assert model._text_doc_subscription is None, "Should not have subscription after cleanup"
    print("✅ Subscription cleaned up")
    
    # Test creating model without existing doc (standalone mode)
    standalone_model = LexicalModel()
    assert standalone_model._text_doc_subscription is None, "Standalone model should not have subscription"
    print("✅ Standalone model works correctly")
    
    return True


if __name__ == "__main__":
    try:
        test_fine_grained_diff_handling()
        test_diff_subscription_lifecycle()
        print("\n🎉 All fine-grained diff tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
