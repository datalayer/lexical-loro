#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""Direct test of the Loro document initialization to isolate the issue."""

import logging
from loro import LoroDoc
from lexical_loro.model.lexical_converter import initialize_loro_doc_with_lexical_content

# Enable logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def test_direct_initialization():
    """Test direct initialization to see if the tree state persists."""
    
    print("🔬 Testing direct Loro document initialization...")
    
    # Create a fresh document
    doc = LoroDoc()
    
    # Check initial state
    tree = doc.get_tree('lexical-tree')
    print(f"Initial state - roots: {len(tree.roots)}, nodes: {len(tree.nodes())}")
    
    # Initialize with lexical content
    print("🚀 Initializing with Lexical content...")
    initialize_loro_doc_with_lexical_content(doc, logger)
    
    # Check immediately after initialization (before commit)
    tree_before_commit = doc.get_tree('lexical-tree') 
    print(f"Before commit - roots: {len(tree_before_commit.roots)}, nodes: {len(tree_before_commit.nodes())}")
    
    # Commit the changes
    print("💾 Committing document...")
    doc.commit()
    
    # Check immediately after commit 
    tree_after_commit = doc.get_tree('lexical-tree')
    print(f"After commit - roots: {len(tree_after_commit.roots)}, nodes: {len(tree_after_commit.nodes())}")
    
    # Check if tree objects are different
    print(f"Tree objects same? {tree is tree_after_commit}")
    
    # Try getting a fresh tree reference
    tree_fresh = doc.get_tree('lexical-tree')
    print(f"Fresh tree - roots: {len(tree_fresh.roots)}, nodes: {len(tree_fresh.nodes())}")
    print(f"Fresh tree objects same? {tree_after_commit is tree_fresh}")
    
    # Try to access roots directly
    if tree_fresh.roots:
        root_id = tree_fresh.roots[0] 
        print(f"Root ID: {root_id}")
        try:
            container = tree_fresh.get(root_id)
            print(f"Container len: {container.len()}")
        except Exception as e:
            print(f"Container access error: {e}")
    
    print("✅ Test completed")

if __name__ == "__main__":
    test_direct_initialization()