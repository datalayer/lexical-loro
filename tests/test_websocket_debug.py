#!/usr/bin/env python3
"""Test the websocket server functionality to debug tree operations."""

import json
import logging

# Enable logging to see what's happening during initialization
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

from lexical_loro.websocket.server import get_doc, clear_docs
from lexical_loro.model.lexical_converter import loro_tree_to_lexical_json

def test_operations():
    """Test operations that create tree content."""
    
    print("🧹 Clearing existing docs...")
    clear_docs()
    
    print("📄 Getting document (this should trigger initialization)...")
    # Get a document (this creates it and auto-initializes with content)
    doc_wrapper = get_doc('test-websocket-debug-fixed')
    
    print(f"Document name: {doc_wrapper.name}")
    print(f"Needs save: {doc_wrapper.needs_save()}")
    
    # Check tree after creation - USE CORRECT TREE NAME
    tree = doc_wrapper.doc.get_tree('lexical-tree') 
    print(f"\n🌳 Tree state after creation:")
    print(f"Tree roots: {len(tree.roots)}")
    print(f"Tree nodes: {len(tree.nodes())}")
    
    # If we have roots, examine them with correct API
    if tree.roots:
        root_id = tree.roots[0]
        print(f"Root ID: {root_id}")
        
        # Use correct tree API
        try:
            children = tree.children(root_id)
            print(f"Root has {len(children)} direct children")
            
            for i, child_id in enumerate(children):
                print(f"  Child {i} ID: {child_id}")
                
                # Get child's children
                child_children = tree.children(child_id)
                print(f"    Child {i} has {len(child_children)} children")
                
                # Get child metadata
                meta = tree.get_meta(child_id)
                print(f"    Child {i} meta keys: {list(meta.keys())}")
                
        except Exception as e:
            print(f"Children access error: {e}")
    
    # Try to convert back to lexical
    print(f"\n🔄 Converting to Lexical JSON...")
    try:
        converted_json = loro_tree_to_lexical_json(doc_wrapper.doc)
        print(f"Converted JSON length: {len(converted_json)}")
        # Parse and show structure
        parsed = json.loads(converted_json)
        root = parsed.get("root", {})
        children = root.get("children", [])
        print(f"Root has {len(children)} children")
        if children:
            for i, child in enumerate(children):
                child_children = child.get('children', [])
                print(f"  Child {i}: type={child.get('type')}, text='{child.get('text', 'N/A')}', has {len(child_children)} children")
                if child_children:
                    for j, grandchild in enumerate(child_children):
                        print(f"    Grandchild {j}: type={grandchild.get('type')}, text='{grandchild.get('text', 'N/A')}'")
        else:
            print("  No children found in root")
        
        print(f"\n📄 Full JSON:")
        print(json.dumps(parsed, indent=2))
            
    except Exception as e:
        print(f"Conversion error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_operations()