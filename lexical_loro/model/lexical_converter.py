# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
LexicalTreeConverter: Bidirectional conversion between Lexical JSON and Loro Tree

This module provides conversion utilities to bridge Lexical editor state (JSON format) 
and Loro tree structure (CRDT format) for collaborative editing.

CONVERSION ARCHITECTURE:
=======================

Lexical JSON Structure:
{
  "root": {
    "type": "root",
    "children": [
      {
        "type": "paragraph", 
        "children": [
          {"type": "text", "text": "Hello", "format": 0}
        ]
      }
    ]
  }
}

Loro Tree Structure:
- TreeNode with data: {"elementType": "root", "lexical": {...}}
- Child TreeNodes with data: {"elementType": "paragraph", "lexical": {...}}
- Leaf TreeNodes with data: {"elementType": "text", "lexical": {...}}

KEY DESIGN PRINCIPLES:
=====================

1. **Lexical JSON as Persistence Format**: 
   - Documents are saved/loaded as Lexical JSON
   - Maintains compatibility with Lexical editor

2. **Loro Tree as Runtime Format**:
   - Used for collaborative operations and synchronization
   - Provides CRDT conflict resolution

3. **Bidirectional Conversion**:
   - import_from_lexical_state(): JSON → Tree  
   - export_to_lexical_state(): Tree → JSON

4. **Key Management**:
   - Lexical keys (__key, key, lexicalKey) are stripped during tree storage
   - TreeID serves as the unique identifier in tree structure
   - Keys are regenerated during JSON export
"""

import json
import logging
from typing import Dict, Any, List, Optional, Union
import loro
from loro import LoroDoc, LoroTree, TreeNode

logger = logging.getLogger(__name__)


class LexicalTreeConverter:
    """
    Converts between Lexical JSON state and Loro Tree structure
    """

    def __init__(self, doc: LoroDoc, tree_name: str = "lexical"):
        """
        Initialize converter with Loro document and tree container
        
        Args:
            doc: Loro document instance
            tree_name: Name of the tree container (default: "lexical")
        """
        self.doc = doc
        self.tree_name = tree_name
        self.tree = self.doc.get_tree(tree_name)

    def _find_node_by_id(self, tree_id) -> Any:
        """
        Find a tree node by its TreeID
        
        Args:
            tree_id: String representation of TreeID to find
            
        Returns:
            TreeNode object
            
        Raises:
            Exception: If tree_id not found
        """
        target_id = str(tree_id)  # Ensure string format
        
        # Iterate through all nodes to find matching ID
        for node in self.tree.get_nodes(False):  # Returns TreeNode objects
            if str(node.id) == target_id:
                return node
        
        # Node not found
        raise Exception(f"TreeNode with ID {tree_id} not found in tree")

    def import_from_lexical_state(self, lexical_json: Union[str, Dict[str, Any]]) -> str:
        """
        Import Lexical JSON state into Loro tree structure
        
        Args:
            lexical_json: Lexical state as JSON string or dict
            
        Returns:
            Root tree node ID as string
            
        Raises:
            ValueError: If lexical_json is invalid or missing root
        """
        # Parse JSON if string provided
        if isinstance(lexical_json, str):
            try:
                parsed_json = json.loads(lexical_json)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON format: {e}")
        else:
            parsed_json = lexical_json

        # Validate structure
        if not isinstance(parsed_json, dict) or "root" not in parsed_json:
            raise ValueError("Lexical state must contain 'root' property")

        root_node_data = parsed_json["root"]
        if not isinstance(root_node_data, dict) or "type" not in root_node_data:
            raise ValueError("Root node must be an object with 'type' property")

        # Clear existing tree content
        self._clear_tree()

        # Create root node and process recursively
        root_tree_id_obj = self.tree.create()
        root_tree_id = str(root_tree_id_obj)
        root_tree_node = self._find_node_by_id(root_tree_id)
        
        self._process_lexical_node(root_node_data, root_tree_node)
        
        logger.info(f"Imported Lexical state to tree with root ID: {root_tree_id}")
        return root_tree_id

    def export_to_lexical_state(self, root_tree_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Export Loro tree structure to Lexical JSON state
        
        Args:
            root_tree_id: Root tree node ID (if None, finds first root)
            
        Returns:
            Lexical state as dictionary
            
        Raises:
            ValueError: If tree is empty or root node not found
        """
        # Find root node
        if root_tree_id is None:
            # Find first node without parent (root node) using TreeNode objects
            all_nodes = list(self.tree.get_nodes(False))  # Get TreeNode objects
            if not all_nodes:
                raise ValueError("Tree is empty")
            
            # Find root node (node without parent)
            root_node = None
            for node in all_nodes:
                if node.parent is None:  # TreeNode has .parent attribute
                    root_node = node
                    break
            
            if root_node is None:
                raise ValueError("No root node found in tree")
        else:
            # Use provided root ID
            try:
                root_node = self._find_node_by_id(root_tree_id)
            except Exception as e:
                raise ValueError(f"Root node with ID {root_tree_id} not found: {e}")

        # Export tree structure to Lexical JSON
        lexical_root = self._export_tree_node(root_node)
        
        lexical_state = {
            "root": lexical_root
        }
        
        logger.info(f"Exported tree to Lexical state from root ID: {root_node}")
        return lexical_state

    def _clear_tree(self) -> None:
        """Clear all nodes from the tree"""
        # Get all nodes and delete them
        all_nodes = list(self.tree.nodes())
        for node in all_nodes:
            try:
                node.delete()
            except Exception as e:
                logger.warning(f"Failed to delete node {node}: {e}")

    def _process_lexical_node(self, lexical_node: Dict[str, Any], tree_node: TreeNode) -> None:
        """
        Recursively process a Lexical node and populate the Loro tree node
        
        Args:
            lexical_node: Lexical node data as dictionary
            tree_node: Loro tree node to populate
        """
        # Store element type for quick access
        node_meta = self.tree.get_meta(tree_node.id)
        node_meta.insert("elementType", lexical_node["type"])
        
        # Clean lexical data by removing key-related fields
        cleaned_lexical_data = self._clean_lexical_data(lexical_node)
        
        # Store cleaned lexical data
        node_meta.insert("lexical", cleaned_lexical_data)
        
        # Process children if they exist
        if "children" in lexical_node and isinstance(lexical_node["children"], list):
            for child_index, child_data in enumerate(lexical_node["children"]):
                if isinstance(child_data, dict) and "type" in child_data:
                    # Create child node
                    child_tree_id_obj = self.tree.create_at(child_index, tree_node.id)
                    child_tree_node = self._find_node_by_id(str(child_tree_id_obj))
                    self._process_lexical_node(child_data, child_tree_node)

    def _export_tree_node(self, tree_node: TreeNode) -> Dict[str, Any]:
        """
        Recursively export a Loro tree node to Lexical JSON format
        
        Args:
            tree_node: Loro tree node to export
            
        Returns:
            Lexical node data as dictionary
        """
        # Get stored lexical data
        node_meta = self.tree.get_meta(tree_node.id)
        
        # Get element type
        element_type_obj = node_meta.get("elementType")
        if element_type_obj is None:
            logger.warning(f"Node {tree_node} missing elementType, using 'unknown'")
            element_type = "unknown"
        else:
            element_type = element_type_obj.value
        
        # Get lexical data
        lexical_data_obj = node_meta.get("lexical")
        if lexical_data_obj is None:
            lexical_data = {}
        else:
            lexical_data = lexical_data_obj.value
        if not isinstance(lexical_data, dict):
            logger.warning(f"Node {tree_node} has invalid lexical data, using empty dict")
            lexical_data = {}
        
        # Create base node structure
        result = {
            "type": element_type,
            **lexical_data
        }
        
        # Generate new key for this node
        result["__key"] = self._generate_node_key()
        
        # Process children
        children = []
        child_ids = self.tree.children(tree_node.id)
        if child_ids is None:
            child_ids = []
        else:
            child_ids = list(child_ids)
        
        # Convert TreeIDs to TreeNodes and sort by index
        child_nodes = []
        for child_id in child_ids:
            # Find the TreeNode that matches this TreeID
            for node in self.tree.get_nodes(False):
                if str(node.id) == str(child_id):
                    child_nodes.append(node)
                    break
        
        # Sort children by index to maintain order
        child_nodes.sort(key=lambda node: node.index if node.index is not None else 0)
        
        for child_node in child_nodes:
            child_lexical_data = self._export_tree_node(child_node)
            children.append(child_lexical_data)
        
        # Add children if any exist
        if children:
            result["children"] = children
        
        return result

    def _clean_lexical_data(self, lexical_node: Dict[str, Any]) -> Dict[str, Any]:
        """
        Remove key-related fields from lexical node data
        
        Args:
            lexical_node: Original lexical node data
            
        Returns:
            Cleaned lexical node data without key fields
        """
        # Keys to remove (TreeID will serve as the unique identifier)
        keys_to_remove = {"__key", "key", "lexicalKey", "children"}
        
        cleaned_data = {}
        for key, value in lexical_node.items():
            if key not in keys_to_remove:
                cleaned_data[key] = value
        
        return cleaned_data

    def _generate_node_key(self) -> str:
        """
        Generate a unique node key for Lexical nodes
        
        Returns:
            Generated node key as string
        """
        import random
        import string
        
        # Generate random alphanumeric key similar to Lexical's approach
        return ''.join(random.choices(string.ascii_letters + string.digits, k=8))

    def get_tree_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the current tree structure
        
        Returns:
            Dictionary with tree statistics
        """
        all_nodes = list(self.tree.nodes())
        
        # Count nodes by type
        type_counts = {}
        for node in all_nodes:
            node_meta = self.tree.get_meta(node)
            element_type_obj = node_meta.get("elementType")
            element_type = element_type_obj.value if element_type_obj else "unknown"
            type_counts[element_type] = type_counts.get(element_type, 0) + 1
        
        return {
            "total_nodes": len(all_nodes),
            "node_types": type_counts,
            "tree_name": self.tree_name
        }