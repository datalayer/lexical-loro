#!/usr/bin/env python3
"""
Debug Loro tree API to understand how to access children
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from loro import LoroDoc

def debug_loro_tree_api():
    """Debug Loro tree API to understand children access"""
    
    print("🔍 Testing Loro tree API...")
    
    doc = LoroDoc()
    tree = doc.get_tree("main")
    
    # Create a simple tree structure manually
    print("📋 Creating manual tree structure...")
    
    # Create root
    root_id = tree.create()
    print(f"Root created: {root_id}")
    
    # Try to create children using the tree API
    try:
        # Method 1: Try to get the root as container and add children
        root_container = tree.get(root_id)
        print(f"Root container: {root_container} (type: {type(root_container)})")
        
        # Try to insert children
        child1_id = tree.create()
        child2_id = tree.create()
        print(f"Child 1 created: {child1_id}")
        print(f"Child 2 created: {child2_id}")
        
        # Try to add them to root
        root_container.push(child1_id)
        root_container.push(child2_id)
        print("Children added to root")
        
        doc.commit()
        
        # Check the structure
        print(f"Root container length after: {root_container.len()}")
        for i in range(root_container.len()):
            child = root_container.get(i)
            print(f"  Child {i}: {child}")
        
    except Exception as e:
        print(f"Error with tree manipulation: {e}")
        import traceback
        traceback.print_exc()
    
    # Try to inspect the tree structure
    print(f"\nTree info:")
    print(f"  Roots: {list(tree.roots)}")
    print(f"  Nodes: {len(tree.nodes())}")

if __name__ == "__main__":
    debug_loro_tree_api()