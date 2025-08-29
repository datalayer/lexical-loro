#!/usr/bin/env python3

"""
Test timing issue - model created before content is added
"""

import json
import loro
from lexical_loro.model.lexical_model import LexicalModel

def test_timing_issue():
    print("=== Testing Timing Issue ===\n")
    
    doc_id = "lexical-shared-doc"
    
    # Scenario 1: Create empty doc, then model, then add content (simulates server behavior)
    print("1. Creating empty LoroDoc...")
    doc = loro.LoroDoc()
    
    print("2. Creating LoroModel with empty doc...")
    model = LexicalModel(text_doc=doc, container_id=doc_id)
    print(f"   Model blocks after creation: {len(model.get_blocks())}")
    
    print("3. Adding content to document (simulating server receiving updates)...")
    text_container = doc.get_text(doc_id)
    
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
                            "text": "Added after model creation",
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
    
    json_content = json.dumps(lexical_content)
    text_container.insert(0, json_content)
    
    print("4. Checking model blocks after content added...")
    print(f"   Model blocks: {len(model.get_blocks())}")
    
    # Force a manual sync
    print("5. Forcing manual sync...")
    model._sync_from_loro()
    print(f"   Model blocks after manual sync: {len(model.get_blocks())}")
    
    # Check what the document contains
    print(f"\n6. Document state check:")
    doc_state = doc.get_deep_value()
    for key, value in doc_state.items():
        print(f"   '{key}': {type(value).__name__} ({len(str(value))} chars)")
        if isinstance(value, str) and len(value) > 0:
            print(f"     Content: {value[:100]}...")

if __name__ == "__main__":
    test_timing_issue()
