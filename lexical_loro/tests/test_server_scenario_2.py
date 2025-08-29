#!/usr/bin/env python3

"""
Test that reproduces the exact server scenario to identify the sync issue.
"""

import json
import sys
sys.path.append('.')

from lexical_loro.model.lexical_model import LexicalModel
import loro


def test_server_scenario():
    """Test that reproduces the exact server scenario"""
    print("=== Testing Exact Server Scenario ===\n")
    
    # Create LoroDoc like the server does
    loro_doc = loro.LoroDoc()
    
    # Initialize with exact initial content from server
    INITIAL_LEXICAL_JSON = """
{"editorState":{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Lexical with Loro","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"},{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Type something...","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}},"lastSaved":1755694807576,"source":"Lexical Loro","version":"0.34.0"}
"""
    
    # Initialize document like server does (check if this uses get_text() properly)
    text_container = loro_doc.get_text("lexical-shared-doc")
    text_container.insert(0, INITIAL_LEXICAL_JSON.strip())
    
    print("1. Initial document setup (like server initialization)")
    print(f"   Document content length: {len(text_container.to_string())}")
    
    # Create LoroModel exactly like server does
    loro_model = LexicalModel(text_doc=loro_doc, container_id="lexical-shared-doc")
    print(f"   LoroModel after creation: {repr(loro_model)}")
    
    # Now simulate what happens when the server receives updates
    print("\n2. Simulating server receiving update from client...")
    
    # Parse current content to simulate incremental updates like the server does
    current_content = json.loads(text_container.to_string())
    print(f"   Current children count: {len(current_content['editorState']['root']['children'])}")
    
    # Add a paragraph like a client would
    new_paragraph = {
        "children": [],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "paragraph",
        "version": 1,
        "textFormat": 0,
        "textStyle": ""
    }
    current_content["editorState"]["root"]["children"].append(new_paragraph)
    
    # Update the document content (like server does when processing client updates)
    updated_content = json.dumps(current_content)
    text_container.delete(0, len(text_container.to_string()))
    text_container.insert(0, updated_content)
    
    print(f"   Updated document children count: {len(current_content['editorState']['root']['children'])}")
    print(f"   Document content length: {len(text_container.to_string())}")
    
    # This is what the server does during ephemeral events
    print(f"   LoroModel before sync: {repr(loro_model)}")
    loro_model._sync_from_loro()
    print(f"   LoroModel after sync: {repr(loro_model)}")
    
    # Add another paragraph to test multiple increments
    print("\n3. Adding another paragraph...")
    current_content = json.loads(text_container.to_string())
    current_content["editorState"]["root"]["children"].append(new_paragraph.copy())
    
    updated_content = json.dumps(current_content)
    text_container.delete(0, len(text_container.to_string()))
    text_container.insert(0, updated_content)
    
    print(f"   Updated document children count: {len(current_content['editorState']['root']['children'])}")
    print(f"   LoroModel before sync: {repr(loro_model)}")
    loro_model._sync_from_loro()
    print(f"   LoroModel after sync: {repr(loro_model)}")
    
    print("\n=== Server Scenario Test Complete ===")


if __name__ == "__main__":
    test_server_scenario()
