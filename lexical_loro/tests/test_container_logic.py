#!/usr/bin/env python3

"""
Quick test to verify container_id logic is correct.
"""

import json
import sys
sys.path.append('.')

from lexical_loro.model.lexical_model import LexicalModel
import loro


def test_container_logic():
    """Test that container_id logic doesn't have duplicates"""
    print("=== Testing Container Logic ===\n")
    
    # Create LoroDoc and add content
    loro_doc = loro.LoroDoc()
    
    # Initialize with content
    INITIAL_CONTENT = """
{"editorState":{"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":"Test","type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"heading","version":1,"tag":"h1"}],"direction":null,"format":"","indent":0,"type":"root","version":1}},"lastSaved":123456,"source":"Test","version":"1.0"}
"""
    
    text_container = loro_doc.get_text("lexical-shared-doc")
    text_container.insert(0, INITIAL_CONTENT.strip())
    
    print("1. Testing with specific container_id='lexical-shared-doc'")
    # Create LoroModel with specific container_id
    loro_model = LexicalModel(text_doc=loro_doc, container_id="lexical-shared-doc")
    print(f"   LoroModel created: {repr(loro_model)}")
    
    print("\n2. Testing sync to see container list")
    # This should only try 'lexical-shared-doc', not duplicates
    loro_model._sync_from_loro()
    
    print("\n3. Testing with no container_id")
    # Create LoroModel without container_id
    loro_model2 = LexicalModel(text_doc=loro_doc)
    print(f"   LoroModel created: {repr(loro_model2)}")
    
    print("\n4. Testing sync with no container_id")
    # This should try the default containers
    loro_model2._sync_from_loro()
    
    print("\n=== Container Logic Test Complete ===")


if __name__ == "__main__":
    test_container_logic()
