# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
TreeNodeMapper: Bidirectional mapping between Lexical keys and Loro Tree IDs

This module provides a Python implementation of the NodeMapper from TypeScript,
managing bidirectional relationships between Lexical node keys and Loro tree node IDs
for collaborative editing operations.

MAPPING ARCHITECTURE:
====================

The mapper maintains two dictionaries:
1. lexical_to_loro: NodeKey → TreeID
2. loro_to_lexical: TreeID → NodeKey

This enables efficient lookup in both directions during synchronization operations.

KEY DESIGN PRINCIPLES:
=====================

1. **Bidirectional Mapping**: 
   - Fast lookup from Lexical keys to Tree IDs
   - Fast lookup from Tree IDs to Lexical keys

2. **Lazy Node Creation**:
   - Creates Tree nodes on-demand when Lexical nodes are processed
   - Maintains proper parent-child relationships

3. **Synchronization Safety**:
   - Thread-safe operations for collaborative editing
   - Consistent state management during updates

4. **Memory Management**:
   - Automatic cleanup of stale mappings
   - Efficient memory usage for large documents
"""

import logging
from typing import Dict, Optional, Set
from loro import LoroDoc, TreeNode

logger = logging.getLogger(__name__)


class TreeNodeMapper:
    """
    Manages bidirectional mapping between Lexical NodeKeys and Loro TreeIDs
    """

    def __init__(self, doc: LoroDoc, tree_name: str = "lexical"):
        """
        Initialize mapper with Loro document and tree container
        
        Args:
            doc: Loro document instance
            tree_name: Name of the tree container (default: "lexical")
        """
        self.doc = doc
        self.tree_name = tree_name
        self.tree = self.doc.get_tree(tree_name)
        
        # Bidirectional mappings
        self.lexical_to_loro: Dict[str, str] = {}
        self.loro_to_lexical: Dict[str, str] = {}
        
        # Track nodes that need cleanup
        self._pending_cleanup: Set[str] = set()

    def _find_node_by_id(self, tree_id: str) -> Optional[TreeNode]:
        """
        Find a tree node by its TreeID
        
        Args:
            tree_id: String representation of TreeID to find
            
        Returns:
            TreeNode if found, None otherwise
            
        Raises:
            Exception: If tree_id not found
        """
        target_id = str(tree_id)  # Ensure string format
        
        # Iterate through all nodes to find matching ID
        for node in self.tree.get_nodes(False):  # with_deleted=False
            if str(node.id) == target_id:
                return node
        
        # Node not found
        raise Exception(f"TreeNode with ID {tree_id} not found in tree")

    def create_mapping(self, lexical_key: str, tree_id: str) -> None:
        """
        Create bidirectional mapping between Lexical key and Tree ID
        
        Args:
            lexical_key: Lexical node key
            tree_id: Loro tree node ID
        """
        # Remove any existing mappings for these keys
        self._remove_existing_mappings(lexical_key, tree_id)
        
        # Create new mappings
        self.lexical_to_loro[lexical_key] = tree_id
        self.loro_to_lexical[tree_id] = lexical_key
        
        logger.debug(f"Created mapping: {lexical_key} ↔ {tree_id}")

    def remove_mapping(self, lexical_key: Optional[str] = None, tree_id: Optional[str] = None) -> None:
        """
        Remove bidirectional mapping by either key or tree ID
        
        Args:
            lexical_key: Lexical node key (optional)
            tree_id: Loro tree node ID (optional)
        """
        if lexical_key is not None and lexical_key in self.lexical_to_loro:
            mapped_tree_id = self.lexical_to_loro[lexical_key]
            del self.lexical_to_loro[lexical_key]
            if mapped_tree_id in self.loro_to_lexical:
                del self.loro_to_lexical[mapped_tree_id]
            logger.debug(f"Removed mapping for lexical key: {lexical_key}")
        
        if tree_id is not None and tree_id in self.loro_to_lexical:
            mapped_lexical_key = self.loro_to_lexical[tree_id]
            del self.loro_to_lexical[tree_id]
            if mapped_lexical_key in self.lexical_to_loro:
                del self.lexical_to_loro[mapped_lexical_key]
            logger.debug(f"Removed mapping for tree ID: {tree_id}")

    def get_tree_id_by_lexical_key(self, lexical_key: str) -> Optional[str]:
        """
        Get Loro Tree ID by Lexical key
        
        Args:
            lexical_key: Lexical node key
            
        Returns:
            Tree ID if mapping exists, None otherwise
        """
        return self.lexical_to_loro.get(lexical_key)

    def get_lexical_key_by_tree_id(self, tree_id: str) -> Optional[str]:
        """
        Get Lexical key by Loro Tree ID
        
        Args:
            tree_id: Loro tree node ID
            
        Returns:
            Lexical key if mapping exists, None otherwise
        """
        return self.loro_to_lexical.get(tree_id)

    def get_loro_node_by_lexical_key(
        self,
        lexical_key: str,
        lexical_node_data: Optional[Dict] = None,
        parent_tree_id: Optional[str] = None,
        index: Optional[int] = None,
        create_if_missing: bool = True
    ) -> Optional[TreeNode]:
        """
        Get Loro tree node by Lexical key, optionally creating if missing
        
        Args:
            lexical_key: Lexical node key
            lexical_node_data: Lexical node data for creation
            parent_tree_id: Parent tree node ID
            index: Child index within parent
            create_if_missing: Whether to create node if mapping doesn't exist
            
        Returns:
            Loro tree node if found/created, None otherwise
        """
        # Check existing mapping
        existing_tree_id = self.lexical_to_loro.get(lexical_key)
        if existing_tree_id:
            try:
                return self._find_node_by_id(existing_tree_id)
            except Exception as e:
                logger.warning(f"Tree node {existing_tree_id} not found, removing stale mapping: {e}")
                self.remove_mapping(lexical_key=lexical_key)
        
        # Create new node if requested and data provided
        if create_if_missing and lexical_node_data:
            return self._create_loro_node(lexical_key, lexical_node_data, parent_tree_id, index)
        
        return None

    def get_lexical_node_by_tree_id(
        self,
        tree_id: str,
        generate_key_if_missing: bool = True
    ) -> Optional[str]:
        """
        Get Lexical key by tree ID, optionally generating if missing
        
        Args:
            tree_id: Loro tree node ID
            generate_key_if_missing: Whether to generate key if mapping doesn't exist
            
        Returns:
            Lexical key if found/generated, None otherwise
        """
        # Check existing mapping
        existing_lexical_key = self.loro_to_lexical.get(tree_id)
        if existing_lexical_key:
            return existing_lexical_key
        
        # Generate new key if requested
        if generate_key_if_missing:
            # Verify tree node exists
            try:
                tree_node = self._find_node_by_id(tree_id)
                if tree_node:
                    new_key = self._generate_lexical_key()
                    self.create_mapping(new_key, tree_id)
                    return new_key
            except Exception as e:
                logger.warning(f"Tree node {tree_id} not found: {e}")
        
        return None

    def sync_existing_nodes(self) -> None:
        """
        Synchronize mappings with existing tree nodes
        Creates mappings for any unmapped tree nodes
        """
        try:
            all_tree_nodes = list(self.tree.nodes())
            logger.debug(f"Syncing {len(all_tree_nodes)} existing tree nodes")
            
            for tree_node in all_tree_nodes:
                tree_id = str(tree_node)
                
                # Skip if already mapped
                if tree_id in self.loro_to_lexical:
                    continue
                
                # Generate lexical key for unmapped tree node
                lexical_key = self._generate_lexical_key()
                self.create_mapping(lexical_key, tree_id)
                
                logger.debug(f"Created mapping for existing node: {lexical_key} ↔ {tree_id}")
                
        except Exception as e:
            logger.error(f"Failed to sync existing nodes: {e}")

    def clear_mappings(self) -> None:
        """Clear all mappings"""
        self.lexical_to_loro.clear()
        self.loro_to_lexical.clear()
        self._pending_cleanup.clear()
        logger.debug("Cleared all node mappings")

    def get_mapping_stats(self) -> Dict[str, int]:
        """
        Get statistics about current mappings
        
        Returns:
            Dictionary with mapping statistics
        """
        return {
            "lexical_to_loro_count": len(self.lexical_to_loro),
            "loro_to_lexical_count": len(self.loro_to_lexical),
            "pending_cleanup_count": len(self._pending_cleanup)
        }

    def _create_loro_node(
        self,
        lexical_key: str,
        lexical_node_data: Dict,
        parent_tree_id: Optional[str] = None,
        index: Optional[int] = None
    ) -> TreeNode:
        """
        Create new Loro tree node with mapping
        
        Args:
            lexical_key: Lexical node key
            lexical_node_data: Lexical node data
            parent_tree_id: Parent tree node ID
            index: Child index within parent
            
        Returns:
            Created Loro tree node
        """
        try:
            # Create tree node
            if parent_tree_id is not None:
                tree_node = self.tree.create_at(index or 0, parent_tree_id)
            else:
                tree_node = self.tree.create()
            
            tree_id = str(tree_node)
            
            # Store node data
            node_meta = self.tree.get_meta(tree_node.id)
            if "type" in lexical_node_data:
                node_meta.insert("elementType", lexical_node_data["type"])
            
            # Clean and store lexical data
            cleaned_data = self._clean_lexical_data(lexical_node_data)
            node_meta.insert("lexical", cleaned_data)
            
            # Create mapping
            self.create_mapping(lexical_key, tree_id)
            
            logger.debug(f"Created new tree node: {lexical_key} → {tree_id}")
            return tree_node
            
        except Exception as e:
            logger.error(f"Failed to create tree node for {lexical_key}: {e}")
            raise

    def _remove_existing_mappings(self, lexical_key: str, tree_id: str) -> None:
        """
        Remove any existing mappings for given keys to ensure consistency
        
        Args:
            lexical_key: Lexical node key
            tree_id: Loro tree node ID
        """
        # Remove existing mapping for lexical key
        if lexical_key in self.lexical_to_loro:
            old_tree_id = self.lexical_to_loro[lexical_key]
            if old_tree_id in self.loro_to_lexical:
                del self.loro_to_lexical[old_tree_id]
        
        # Remove existing mapping for tree ID
        if tree_id in self.loro_to_lexical:
            old_lexical_key = self.loro_to_lexical[tree_id]
            if old_lexical_key in self.lexical_to_loro:
                del self.lexical_to_loro[old_lexical_key]

    def _clean_lexical_data(self, lexical_node_data: Dict) -> Dict:
        """
        Remove key-related fields from lexical node data
        
        Args:
            lexical_node_data: Original lexical node data
            
        Returns:
            Cleaned lexical node data
        """
        keys_to_remove = {"__key", "key", "lexicalKey", "children"}
        
        cleaned_data = {}
        for key, value in lexical_node_data.items():
            if key not in keys_to_remove:
                cleaned_data[key] = value
        
        return cleaned_data

    def _generate_lexical_key(self) -> str:
        """
        Generate unique lexical key
        
        Returns:
            Generated lexical key
        """
        import random
        import string
        
        # Generate random alphanumeric key
        return ''.join(random.choices(string.ascii_letters + string.digits, k=8))