#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Debug script to understand Loro tree container structure
"""

import sys
from pathlib import Path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from lexical_loro.websocket.server import get_doc, clear_docs

def debug_tree_structure():
    print("🔍 Debug: Investigating Loro tree container structure")
    
    # Create a document with known structure
    clear_docs()
    doc = get_doc('debug-doc')
    
    tree = doc.doc.get_tree('main')
    print(f"Tree roots: {list(tree.roots)}")
    print(f"Tree nodes: {len(tree.nodes())}")
    
    if tree.roots:
        root_id = tree.roots[0]
        print(f"\nInvestigating root: {root_id}")
        
        try:
            # Try to get the container
            container = tree.get(root_id)
            print(f"Root container: {container} (type: {type(container)})")
            print(f"Container length: {container.len()}")
            
            # Try to get children
            print("\nChildren investigation:")
            for i in range(container.len()):
                child_id = container.get(i)
                print(f"  Child {i}: {child_id}")
                
                # Try to get child container
                try:
                    child_container = tree.get(child_id)
                    print(f"    Child container: {child_container}")
                    print(f"    Child container length: {child_container.len()}")
                    
                    # Get child metadata
                    child_meta = tree.get_meta(child_id)
                    child_keys = list(child_meta.keys())
                    print(f"    Child meta keys: {child_keys}")
                    
                    if 'elementType' in child_keys:
                        element_type = child_meta.get('elementType')
                        print(f"    Child element type: {element_type}")
                    
                    # Check for grandchildren
                    for j in range(child_container.len()):
                        grandchild_id = child_container.get(j)
                        print(f"      Grandchild {j}: {grandchild_id}")
                        
                except Exception as e:
                    print(f"    Error accessing child {i}: {e}")
                    
        except Exception as e:
            print(f"Error accessing root container: {e}")
    
    print("\n" + "="*50)
    print("🔍 Alternative approach: Using get_value()")
    
    try:
        tree_value = tree.get_value()
        print(f"Tree value type: {type(tree_value)}")
        print(f"Tree value length: {len(tree_value)}")
        
        for i, node_info in enumerate(tree_value):
            print(f"Node {i}: {node_info}")
            
    except Exception as e:
        print(f"Error using get_value(): {e}")

if __name__ == "__main__":
    debug_tree_structure()