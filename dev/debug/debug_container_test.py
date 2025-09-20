#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


"""
Debug test to identify container naming issue
"""

import json
import loro
from lexical_loro.model.lexical_model import LexicalModel

def test_container_issue():
    print("=== Testing Container Issue ===\n")
    
    # Create a LoroDoc and add content to the same container the server uses
    doc = loro.LoroDoc()
    
    # Add content to the "lexical-shared-doc" container (what the server uses)
    text_container = doc.get_text("lexical-shared-doc")
    
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
                            "text": "Hello World",
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
    
    # Insert the content into the text container
    json_content = json.dumps(lexical_content)
    text_container.insert(0, json_content)
    
    print(f"1. Created LoroDoc with content in 'lexical-shared-doc' container")
    print(f"   Content length: {len(json_content)} chars")
    print(f"   Content preview: {json_content[:100]}...")
    
    # Check what containers exist
    doc_state = doc.get_deep_value()
    print(f"\n2. Document state:")
    for key, value in doc_state.items():
        print(f"   '{key}': {type(value).__name__} ({len(str(value))} chars)")
    
    # Check if we can read back from the container
    try:
        read_back = doc.get_text("lexical-shared-doc").to_string()
        print(f"\n3. Read back from 'lexical-shared-doc': {len(read_back)} chars")
        print(f"   Content matches: {read_back == json_content}")
    except Exception as e:
        print(f"\n3. ERROR reading back: {e}")
    
    # Now create a LoroModel with this document
    print(f"\n4. Creating LoroModel with existing document...")
    model = LexicalModel(text_doc=doc)
    
    print(f"   Model blocks: {len(model.get_blocks())}")
    print(f"   Model lexical_data: {model.lexical_data}")
    
    # Test the sync methods directly
    print(f"\n5. Testing sync methods...")
    
    # Test _get_current_text_content
    current_content = model._get_current_text_content()
    print(f"   _get_current_text_content(): {len(current_content)} chars")
    
    # Test _sync_from_loro
    print(f"   Before _sync_from_loro: {len(model.get_blocks())} blocks")
    model._sync_from_loro()
    print(f"   After _sync_from_loro: {len(model.get_blocks())} blocks")

if __name__ == "__main__":
    test_container_issue()
