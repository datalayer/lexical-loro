#!/usr/bin/env python3

"""
Test the container_id fix - simulate server behavior exactly
"""

import json
import loro
from lexical_loro.model.lexical_model import LexicalModel

def test_container_id_fix():
    print("=== Testing Container ID Fix ===\n")
    
    # Simulate the exact server scenario
    doc_id = "lexical-shared-doc"
    
    # Create a LoroDoc and add content using the doc_id as container name (like the server does)
    doc = loro.LoroDoc()
    text_container = doc.get_text(doc_id)  # Container name = doc_id
    
    # Sample lexical content
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
                            "text": "Hello World from Server",
                            "type": "text",
                            "version": 1
                        }
                    ],
                    "direction": "ltr",
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1
                },
                {
                    "children": [
                        {
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "text": "Second paragraph",
                            "type": "text",
                            "version": 1
                        }
                    ],
                    "direction": "ltr",
                    "format": "",
                    "indent": 0,
                    "type": "paragraph",
                    "version": 1
                }
            ],
            "direction": None,
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1
        }
    }
    
    # Insert content into container named with doc_id (as server does)
    json_content = json.dumps(lexical_content)
    text_container.insert(0, json_content)
    
    print(f"1. Created LoroDoc with content in '{doc_id}' container")
    print(f"   Content length: {len(json_content)} chars")
    print(f"   Expected blocks: {len(lexical_content['root']['children'])}")
    
    # Test OLD behavior (without container_id)
    print(f"\n2. Testing OLD behavior (without container_id)...")
    old_model = LexicalModel(text_doc=doc)
    print(f"   OLD Model blocks: {len(old_model.get_blocks())}")
    
    # Test NEW behavior (with container_id)
    print(f"\n3. Testing NEW behavior (with container_id='{doc_id}')...")
    new_model = LexicalModel(text_doc=doc, container_id=doc_id)
    print(f"   NEW Model blocks: {len(new_model.get_blocks())}")
    
    # Verify the content is correct
    if len(new_model.get_blocks()) > 0:
        print(f"   ✅ SUCCESS: Model found {len(new_model.get_blocks())} blocks")
        for i, block in enumerate(new_model.get_blocks()):
            block_type = block.get('type', 'unknown')
            block_text = ""
            for child in block.get('children', []):
                if child.get('type') == 'text':
                    block_text += child.get('text', '')
            print(f"     Block {i}: {block_type} - '{block_text}'")
    else:
        print(f"   ❌ FAILED: Model still shows 0 blocks")
    
    print(f"\n4. Document container overview:")
    doc_state = doc.get_deep_value()
    for key, value in doc_state.items():
        print(f"   '{key}': {type(value).__name__} ({len(str(value))} chars)")

if __name__ == "__main__":
    test_container_id_fix()
