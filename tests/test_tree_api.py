#!/usr/bin/env python3
"""Test the actual tree API to understand available methods."""

import logging
from loro import LoroDoc
from lexical_loro.model.lexical_converter import initialize_loro_doc_with_lexical_content

# Enable logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_tree_api():
    """Test tree API to understand available methods."""
    
    # Create and initialize document
    doc = LoroDoc()
    initialize_loro_doc_with_lexical_content(doc, logger)
    doc.commit()
    
    # Get tree
    tree = doc.get_tree('lexical-tree')
    print(f"Tree: {tree}")
    print(f"Tree type: {type(tree)}")
    print(f"Roots: {list(tree.roots)}")
    
    # Get available methods on tree
    print(f"Tree methods: {[method for method in dir(tree) if not method.startswith('_')]}")
    
    if tree.roots:
        root_id = tree.roots[0]
        print(f"Root ID: {root_id}")
        print(f"Root ID type: {type(root_id)}")
        
        # Try different methods to access container
        try:
            # Method 1: Try tree.get_container(id)
            if hasattr(tree, 'get_container'):
                container = tree.get_container(root_id)
                print(f"get_container result: {container}")
        except Exception as e:
            print(f"get_container error: {e}")
            
        try:
            # Method 2: Try tree.get_value_at(id)
            if hasattr(tree, 'get_value_at'):
                value = tree.get_value_at(root_id)
                print(f"get_value_at result: {value}")
        except Exception as e:
            print(f"get_value_at error: {e}")
            
        try:
            # Method 3: Try tree[id]
            value = tree[root_id]
            print(f"tree[id] result: {value}")
        except Exception as e:
            print(f"tree[id] error: {e}")
            
        try:
            # Method 4: Try tree.get_by_id(id) 
            if hasattr(tree, 'get_by_id'):
                value = tree.get_by_id(root_id)
                print(f"get_by_id result: {value}")
        except Exception as e:
            print(f"get_by_id error: {e}")
            
        try:
            # Method 5: Check tree metadata
            if hasattr(tree, 'get_meta'):
                meta = tree.get_meta(root_id)
                print(f"get_meta result: {meta}")
        except Exception as e:
            print(f"get_meta error: {e}")
            
        try:
            # Method 6: Check children methods
            if hasattr(tree, 'children'):
                children = tree.children(root_id)
                print(f"children result: {children}")
        except Exception as e:
            print(f"children error: {e}")

if __name__ == "__main__":
    test_tree_api()