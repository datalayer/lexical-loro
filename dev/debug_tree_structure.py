#!/usr/bin/env python3
"""
Debug script to understand Loro tree structure for children
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from lexical_loro.websocket.server import get_doc, loro_tree_to_lexical_json
import json

def debug_tree_structure():
    """Debug the tree structure to understand how children are organized"""
    
    # Get a document that already has the tree structure
    print("🔍 Getting document with existing Lexical content...")
    
    # Create a document using the server's get_doc function
    doc_wrapper = get_doc("debug-doc")
    doc = doc_wrapper.doc
    
    # Get the tree
    tree = doc.get_tree("main")
    print(f"\n🌳 Tree information:")
    print(f"  Roots: {list(tree.roots)}")
    
    # Try different ways to access tree data
    print(f"\n🔍 Exploring tree nodes:")
    for i, root_id in enumerate(tree.roots):
        print(f"\n  Root {i} ID: {root_id}")
        
        # Get metadata
        try:
            meta = tree.get_meta(root_id)
            print(f"    Meta keys: {list(meta.keys())}")
            for key in meta.keys():
                value = meta.get(key)
                print(f"      {key}: {value} (type: {type(value)})")
        except Exception as e:
            print(f"    Error getting meta: {e}")
        
        # Try to get children using different methods
        try:
            container = tree.get(root_id)
            print(f"    Container: {container} (type: {type(container)})")
            if hasattr(container, 'len'):
                print(f"    Container length: {container.len()}")
                if container.len() > 0:
                    for idx in range(container.len()):
                        child = container.get(idx)
                        print(f"      Child {idx}: {child} (type: {type(child)})")
                        
                        # If this is a child node ID, try to get its info
                        if hasattr(child, 'value'):
                            child_id = child.value
                        else:
                            child_id = child
                            
                        try:
                            child_meta = tree.get_meta(child_id)
                            print(f"        Child meta keys: {list(child_meta.keys())}")
                        except Exception as e:
                            print(f"        Error getting child meta: {e}")
        except Exception as e:
            print(f"    Error getting container: {e}")
    
    # Test the conversion
    print(f"\n📋 Testing Loro to Lexical conversion:")
    try:
        lexical_json = loro_tree_to_lexical_json(doc)
        print(f"  Conversion result: {lexical_json}")
        
        # Parse and pretty print
        parsed = json.loads(lexical_json)
        print(f"  Parsed structure:")
        print(json.dumps(parsed, indent=2))
        
    except Exception as e:
        print(f"  Conversion error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_tree_structure()