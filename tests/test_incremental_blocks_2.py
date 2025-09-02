#!/usr/bin/env python3

"""
Test incremental block count changes
"""

import json
import loro
from lexical_loro.model.lexical_model import LexicalModel

def test_incremental_blocks():
    print("=== Testing Incremental Block Count ===\n")
    
    doc_id = "lexical-shared-doc"
    doc = loro.LoroDoc()
    
    # Create model with container_id
    model = LexicalModel(text_doc=doc, container_id=doc_id)
    print(f"1. Initial model blocks: {len(model.get_blocks())}")
    
    # Add first paragraph
    lexical_content_1 = {
        "editorState": {
            "root": {
                "children": [
                    {
                        "children": [{"detail": 0, "format": 0, "mode": "normal", "style": "", "text": "First paragraph", "type": "text", "version": 1}],
                        "direction": "ltr", "format": "", "indent": 0, "type": "paragraph", "version": 1
                    }
                ],
                "direction": None, "format": "", "indent": 0, "type": "root", "version": 1
            }
        },
        "lastSaved": 123456, "source": "Test", "version": "1.0"
    }
    
    text_container = doc.get_text(doc_id)
    text_container.insert(0, json.dumps(lexical_content_1))
    
    print(f"2. After adding 1 paragraph:")
    print(f"   Model blocks: {len(model.get_blocks())}")
    
    # Add second paragraph
    lexical_content_2 = {
        "editorState": {
            "root": {
                "children": [
                    {
                        "children": [{"detail": 0, "format": 0, "mode": "normal", "style": "", "text": "First paragraph", "type": "text", "version": 1}],
                        "direction": "ltr", "format": "", "indent": 0, "type": "paragraph", "version": 1
                    },
                    {
                        "children": [{"detail": 0, "format": 0, "mode": "normal", "style": "", "text": "Second paragraph", "type": "text", "version": 1}],
                        "direction": "ltr", "format": "", "indent": 0, "type": "paragraph", "version": 1
                    }
                ],
                "direction": None, "format": "", "indent": 0, "type": "root", "version": 1
            }
        },
        "lastSaved": 123457, "source": "Test", "version": "1.0"
    }
    
    # Clear and replace content (simulating document update)
    text_container.delete(0, len(text_container.to_string()))
    text_container.insert(0, json.dumps(lexical_content_2))
    
    print(f"3. After adding 2nd paragraph:")
    print(f"   Model blocks: {len(model.get_blocks())}")
    
    # Force manual sync to verify it works
    model._sync_from_loro()
    print(f"4. After manual sync:")
    print(f"   Model blocks: {len(model.get_blocks())}")
    
    # Test the detailed representation
    print(f"5. Model detailed state: {repr(model)}")

if __name__ == "__main__":
    test_incremental_blocks()
