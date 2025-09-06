#!/usr/bin/env python3

"""
Test that simulates the real-time collaboration scenario where multiple clients
are making changes to the same LoroDoc.
"""

import json
import time
import sys
sys.path.append('.')

from lexical_loro.model.lexical_model import LexicalModel
import loro


def test_concurrent_changes():
    """Test scenario that mimics the server environment"""
    print("=== Testing Concurrent Changes (Server Simulation) ===\n")
    
    # Create a shared LoroDoc (this simulates the server's loro_docs dictionary)
    shared_doc = loro.LoroDoc()
    
    # Initialize with some content (similar to what server starts with)
    initial_content = {
        "editorState": {
            "root": {
                "children": [
                    {
                        "children": [{
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "text": "Lexical with Loro",
                            "type": "text",
                            "version": 1
                        }],
                        "direction": "ltr",
                        "format": "",
                        "indent": 0,
                        "type": "heading",
                        "version": 1,
                        "tag": "h1"
                    },
                    {
                        "children": [{
                            "detail": 0,
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "text": "Type something...",
                            "type": "text",
                            "version": 1
                        }],
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
        },
        "lastSaved": 1755694807576,
        "source": "Lexical Loro", 
        "version": "0.34.0"
    }
    
    # Put initial content in the shared doc (simulates server initialization)
    text_container = shared_doc.get_text("lexical-shared-doc")
    text_container.insert(0, json.dumps(initial_content))
    
    print("1. Initial shared document setup complete")
    
    # Create LoroModel using the shared doc (simulates server's get_loro_model())
    model = LexicalModel(text_doc=shared_doc, container_id="lexical-shared-doc")
    print(f"   Model after creation: blocks={len(model.lexical_data.get('root', {}).get('children', []))}")
    print(f"   Model repr: {repr(model)}")
    
    # Simulate client adding a paragraph (like what happens in real-time collaboration)
    print("\n2. Simulating client adding a paragraph...")
    
    # Get current content from the LoroDoc
    current_content_str = text_container.to_string()
    current_content = json.loads(current_content_str)
    
    # Add a new paragraph (simulates client change)
    new_paragraph = {
        "children": [],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1
    }
    current_content["editorState"]["root"]["children"].append(new_paragraph)
    
    # Update the LoroDoc (simulates receiving changes from a client)
    text_container.delete(0, len(current_content_str))
    text_container.insert(0, json.dumps(current_content))
    
    print(f"   Document now has {len(current_content['editorState']['root']['children'])} children")
    
    # Check LoroModel state (simulates what server logs show)
    print(f"   Model before sync: {repr(model)}")
    
    # Manually sync (simulates server's explicit sync call)
    model._sync_from_loro()
    print(f"   Model after sync: {repr(model)}")
    
    # Add another paragraph
    print("\n3. Adding another paragraph...")
    current_content_str = text_container.to_string()
    current_content = json.loads(current_content_str)
    current_content["editorState"]["root"]["children"].append({
        "children": [],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1
    })
    
    text_container.delete(0, len(current_content_str))
    text_container.insert(0, json.dumps(current_content))
    
    print(f"   Document now has {len(current_content['editorState']['root']['children'])} children")
    print(f"   Model before sync: {repr(model)}")
    model._sync_from_loro()
    print(f"   Model after sync: {repr(model)}")
    
    print("\n=== Test Complete ===")


if __name__ == "__main__":
    test_concurrent_changes()
