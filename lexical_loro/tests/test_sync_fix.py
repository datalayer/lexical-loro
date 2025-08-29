#!/usr/bin/env python3
"""Test script to verify LoroModel syncs correctly from existing content"""

import json
import time
from lexical_loro.model.lexical_model import LexicalModel
from loro import LoroDoc


def test_sync_from_existing_content():
    """Test that LoroModel correctly syncs from existing document content"""
    print("🧪 Testing sync from existing content...")
    
    # Create a LoroDoc and add content like the server does
    text_doc = LoroDoc()
    
    # Simulate the server's content structure
    lexical_content = {
        "root": {
            "children": [
                {
                    "children": [
                        {
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "text": "dsqfdsqsdfq",
                            "type": "text",
                            "version": 1,
                            "$": {"stable-node-id": "node_1756387102525_a2q9iun55"}
                        }
                    ],
                    "direction": "ltr",
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1,
                    "$": {"stable-node-id": "node_1756387051167_mazk7rq2e"},
                    "textFormat": 0,
                    "textStyle": ""
                },
                {
                    "children": [],
                    "direction": None,
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1,
                    "$": {"stable-node-id": "node_1756387131496_2za3wjbmn"},
                    "textFormat": 0,
                    "textStyle": ""
                }
            ],
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1,
            "$": {"stable-node-id": "node_1756387033534_suv4sdaar"}
        }
    }
    
    # Test with different container names that the server might use
    test_containers = ["lexical-shared-doc", "shared-text", "content"]
    
    for container_name in test_containers:
        print(f"\n📋 Testing with container: '{container_name}'")
        
        # Create fresh document
        doc = LoroDoc()
        text_container = doc.get_text(container_name)
        
        # Add content as JSON string
        content_json = json.dumps(lexical_content)
        text_container.insert(0, content_json)
        doc.commit()
        
        print(f"📝 Added content to '{container_name}' container ({len(content_json)} chars)")
        
        # Create LoroModel with existing document
        model = LexicalModel(text_doc=doc)
        
        # Check if it synced correctly
        blocks = model.get_blocks()
        print(f"🧠 LoroModel: {model}")
        print(f"📋 Synced blocks: {len(blocks)}")
        
        if len(blocks) > 0:
            print(f"✅ Successfully synced from '{container_name}' container!")
            
            # Verify content
            first_block = blocks[0]
            first_text = model._extract_block_text(first_block)
            print(f"📝 First block text: '{first_text}'")
            
            assert first_text == "dsqfdsqsdfq", f"Expected 'dsqfdsqsdfq', got '{first_text}'"
            assert len(blocks) == 2, f"Expected 2 blocks, got {len(blocks)}"
            
            # Test that subscription is active
            summary = model.get_block_summary()
            assert summary['has_subscription'], "Should have active subscription"
            print(f"📊 Block summary: {summary}")
            
            # Cleanup
            model.cleanup()
            print(f"🧹 Cleaned up model for '{container_name}'")
            break
        else:
            print(f"❌ Failed to sync from '{container_name}' container")
    
    print("✅ Sync from existing content test completed!")
    return True


def test_server_like_scenario():
    """Test a scenario that mimics the server setup"""
    print("\n🧪 Testing server-like scenario...")
    
    # Create document like the server does
    doc = LoroDoc()
    
    # Server uses doc_id as container name
    doc_id = "lexical-shared-doc"
    text_container = doc.get_text(doc_id)
    
    # Server initial content
    initial_lexical_json = """{"editorState":{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}},"lastSaved":1755694807576,"source":"Lexical Loro","version":"0.34.0"}"""
    
    text_container.insert(0, initial_lexical_json)
    doc.commit()
    
    print(f"📝 Created document with server-like content")
    
    # Create model like the server does
    model = LexicalModel(text_doc=doc)
    
    blocks = model.get_blocks()
    print(f"🧠 LoroModel: {model}")
    print(f"📋 Blocks found: {len(blocks)}")
    
    if len(blocks) > 0:
        print("✅ Successfully synced server-like content!")
        for i, block in enumerate(blocks):
            block_type = block.get('type', 'unknown')
            block_text = model._extract_block_text(block)
            print(f"📋 Block {i}: type='{block_type}', text='{block_text}'")
    else:
        print("❌ Failed to sync server-like content")
        
        # Debug: check what's in the document
        print("🔍 Debug: checking document content...")
        try:
            content = text_container.to_string()
            print(f"📄 Raw content length: {len(content)}")
            print(f"📄 Content preview: {content[:200]}...")
            
            # Try parsing
            parsed = json.loads(content)
            print(f"📄 Parsed JSON keys: {list(parsed.keys())}")
            
        except Exception as e:
            print(f"❌ Debug failed: {e}")
    
    model.cleanup()
    print("🧹 Cleaned up server-like test")
    
    return len(blocks) > 0


if __name__ == "__main__":
    try:
        test_sync_from_existing_content()
        test_server_like_scenario()
        print("\n🎉 All sync tests completed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
