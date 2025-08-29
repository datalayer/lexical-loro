#!/usr/bin/env python3
"""Test script to verify LoroModel subscription functionality"""

import json
import time
from lexical_loro.model.lexical_model import LexicalModel
from loro import LoroDoc


def test_subscription_functionality():
    """Test that LoroModel correctly subscribes to text_doc changes"""
    print("🧪 Testing LoroModel subscription functionality...")
    
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
                            "text": "Initial content",
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
        "source": "Test Source",
        "version": "0.34.0"
    }
    
    # Insert initial content
    text_container.insert(0, json.dumps(initial_content))
    text_doc.commit()
    
    print("📝 Created text_doc with initial content")
    
    # Create LoroModel with existing text_doc (should set up subscription)
    model = LexicalModel(text_doc=text_doc)
    
    print(f"🧠 Created LoroModel: {model}")
    print(f"🧠 Model details: {repr(model)}")
    
    # Verify initial sync worked
    blocks = model.get_blocks()
    print(f"📋 Initial blocks: {len(blocks)}")
    assert len(blocks) == 1, f"Expected 1 block, got {len(blocks)}"
    assert blocks[0]['type'] == 'paragraph', f"Expected paragraph, got {blocks[0]['type']}"
    
    # Verify the model shows it's subscribed
    summary = model.get_block_summary()
    print(f"📊 Block summary: {summary}")
    assert summary['has_subscription'], "Model should have subscription active"
    
    print("✅ Initial subscription setup test passed!")
    
    # Now test updating the text_doc externally
    print("\n🔄 Testing external text_doc updates...")
    
    updated_content = initial_content.copy()
    updated_content["root"]["children"].append({
        "children": [
            {
                "detail": 0,
                "format": 0,
                "mode": "normal",
                "style": "",
                "text": "Added via external update",
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
    updated_content["lastSaved"] = int(time.time() * 1000)
    
    # Update the text document externally
    current_content = text_container.to_string()
    text_container.delete(0, len(current_content))
    text_container.insert(0, json.dumps(updated_content))
    text_doc.commit()
    
    print("📝 Updated text_doc externally")
    
    # Give a moment for the subscription to process
    time.sleep(0.1)
    
    # Check if the model was updated via subscription
    updated_blocks = model.get_blocks()
    print(f"📋 Updated blocks: {len(updated_blocks)}")
    print(f"🧠 Updated model: {model}")
    
    # Test cleanup
    print("\n🧹 Testing cleanup...")
    model.cleanup()
    print(f"🧠 Model after cleanup: {model}")
    
    final_summary = model.get_block_summary()
    print(f"📊 Final summary: {final_summary}")
    
    print("✅ Subscription functionality test completed!")
    return True


if __name__ == "__main__":
    try:
        test_subscription_functionality()
        print("\n🎉 All subscription tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
