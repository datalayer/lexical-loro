"""
Unit tests for lexical_converter.py

Tests the conversion from Lexical JSON format to Loro tree structure
using the Loro 1.6.0 API patterns.
"""

import unittest
import json
from typing import Dict, Any
import loro
from lexical_loro.model.lexical_converter import lexical_to_loro_tree, INITIAL_LEXICAL_JSON, process_lexical_node


class TestLexicalConverter(unittest.TestCase):
    """Test cases for Lexical to Loro tree conversion"""

    def setUp(self):
        """Set up test fixtures before each test method"""
        self.doc = loro.LoroDoc()
        self.tree = self.doc.get_tree('tree')
        self.tree.enable_fractional_index(1)

    def test_simple_text_conversion(self):
        """Test conversion of simple text structure"""
        simple_lexical = {
            "root": {
                "type": "root",
                "children": [{
                    "type": "paragraph", 
                    "children": [{
                        "type": "text",
                        "text": "Hello World",
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "detail": 0,
                        "version": 1
                    }],
                    "direction": None,
                    "format": "",
                    "indent": 0,
                    "version": 1
                }],
                "direction": None,
                "format": "",
                "indent": 0,
                "version": 1
            }
        }
        
        # Convert to Loro tree
        root_id = lexical_to_loro_tree(simple_lexical, self.tree)
        
        # Verify structure
        self.assertIsNotNone(root_id)
        
        # Check tree has nodes
        all_nodes = self.tree.nodes()
        self.assertGreater(len(all_nodes), 0, "Tree should have nodes")
        
        # Find root node by element type
        root_tree_id = None
        for node_id in all_nodes:
            meta = self.tree.get_meta(node_id)
            element_type = meta.get('elementType')
            if element_type and element_type.value == 'root':
                root_tree_id = node_id
                break
        
        self.assertIsNotNone(root_tree_id, "Should find root node")
        root_meta = self.tree.get_meta(root_tree_id)
        
        element_type = root_meta.get('elementType')
        self.assertIsNotNone(element_type, "Root should have elementType")
        self.assertEqual(element_type.value, 'root', "Root elementType should be 'root'")
        
        # Verify lexical data storage
        lexical_data = root_meta.get('lexical')
        self.assertIsNotNone(lexical_data, "Root should have lexical data")
        
        lexical_value = lexical_data.value
        self.assertIsInstance(lexical_value, dict, "Lexical data should be dictionary")
        self.assertEqual(lexical_value['type'], 'root', "Lexical type should be 'root'")

    def test_nested_structure_conversion(self):
        """Test conversion of nested structure with multiple children"""
        nested_lexical = {
            "root": {
                "type": "root",
                "children": [
                    {
                        "type": "heading",
                        "tag": "h1",
                        "children": [{
                            "type": "text", 
                            "text": "Title",
                            "format": 0,
                            "mode": "normal",
                            "style": "",
                            "detail": 0,
                            "version": 1
                        }],
                        "direction": None,
                        "format": "",
                        "indent": 0,
                        "version": 1
                    },
                    {
                        "type": "paragraph",
                        "children": [{
                            "type": "text",
                            "text": "Content",
                            "format": 0,
                            "mode": "normal", 
                            "style": "",
                            "detail": 0,
                            "version": 1
                        }],
                        "direction": None,
                        "format": "",
                        "indent": 0,
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "version": 1
            }
        }
        
        # Convert to Loro tree
        root_id = lexical_to_loro_tree(nested_lexical, self.tree)
        
        # Verify structure
        self.assertIsNotNone(root_id)
        
        # Check we have multiple nodes (root + children)
        all_nodes = self.tree.nodes()
        self.assertGreaterEqual(len(all_nodes), 3, "Should have root + 2 children minimum")
        
        # Verify different node types exist
        node_types = []
        for node_id in all_nodes:
            meta = self.tree.get_meta(node_id)
            element_type = meta.get('elementType')
            if element_type:
                node_types.append(element_type.value)
        
        self.assertIn('root', node_types, "Should have root node")
        self.assertIn('heading', node_types, "Should have heading node") 
        self.assertIn('paragraph', node_types, "Should have paragraph node")

    def test_initial_lexical_json_conversion(self):
        """Test conversion of the actual INITIAL_LEXICAL_JSON structure"""
        # Convert the predefined initial content
        root_id = lexical_to_loro_tree(INITIAL_LEXICAL_JSON, self.tree)
        
        # Verify conversion succeeded
        self.assertIsNotNone(root_id)
        
        # Check tree structure
        all_nodes = self.tree.nodes()
        self.assertGreater(len(all_nodes), 0, "Initial content should create nodes")
        
        # Verify we have expected node types from INITIAL_LEXICAL_JSON
        node_types = []
        text_contents = []
        
        for node_id in all_nodes:
            try:
                meta = self.tree.get_meta(node_id)
                
                # Check element type
                element_type = meta.get('elementType')
                if element_type:
                    node_types.append(element_type.value)
                
                # Check text content
                lexical_data = meta.get('lexical')
                if lexical_data and hasattr(lexical_data, 'value'):
                    lex_val = lexical_data.value
                    if isinstance(lex_val, dict) and 'text' in lex_val:
                        text_contents.append(lex_val['text'])
            except Exception as e:
                self.fail(f"Failed to access node metadata: {e}")
        
        # Verify expected structure from INITIAL_LEXICAL_JSON
        self.assertIn('root', node_types, "Should have root node")
        self.assertIn('heading', node_types, "Should have heading from initial content")
        self.assertIn('paragraph', node_types, "Should have paragraph from initial content")
        self.assertIn('text', node_types, "Should have text nodes")
        
        # Verify expected text content
        self.assertIn('Lexical with Loro', text_contents, "Should have title text")
        self.assertIn('Type something...', text_contents, "Should have placeholder text")

    def test_metadata_storage_format(self):
        """Test that metadata is stored in correct Loro 1.6.0 format"""
        test_lexical = {
            "root": {
                "type": "paragraph",
                "children": [{
                    "type": "text",
                    "text": "Test content",
                    "format": 1,  # Bold format
                    "mode": "normal",
                    "style": "color: red;",
                    "detail": 0,
                    "version": 1
                }],
                "direction": "ltr",
                "format": "",
                "indent": 2,
                "version": 1
            }
        }
        
        root_id = lexical_to_loro_tree(test_lexical, self.tree)
        
        # Find the paragraph node
        all_nodes = self.tree.nodes()
        paragraph_node_id = None
        for node_id in all_nodes:
            meta = self.tree.get_meta(node_id)
            element_type = meta.get('elementType')
            if element_type and element_type.value == 'paragraph':
                paragraph_node_id = node_id
                break
        
        self.assertIsNotNone(paragraph_node_id, "Should find paragraph node")
        meta = self.tree.get_meta(paragraph_node_id)
        
        # Verify elementType storage
        element_type = meta.get('elementType')
        self.assertIsNotNone(element_type)
        self.assertEqual(element_type.value, 'paragraph')
        
        # Verify lexical data storage and structure
        lexical_data = meta.get('lexical')
        self.assertIsNotNone(lexical_data)
        
        lexical_value = lexical_data.value
        self.assertIsInstance(lexical_value, dict)
        
        # Verify key fields are preserved
        self.assertEqual(lexical_value['type'], 'paragraph')
        self.assertEqual(lexical_value['direction'], 'ltr') 
        self.assertEqual(lexical_value['indent'], 2)
        self.assertEqual(lexical_value['version'], 1)
        
        # Verify key fields are removed (TreeID serves as key)
        self.assertNotIn('__key', lexical_value, "Should not store __key field")
        self.assertNotIn('key', lexical_value, "Should not store key field")
        self.assertNotIn('lexicalKey', lexical_value, "Should not store lexicalKey field")

    def test_empty_children_handling(self):
        """Test handling of nodes with empty children arrays"""
        empty_children_lexical = {
            "root": {
                "type": "root", 
                "children": [],  # Empty children
                "direction": None,
                "format": "",
                "indent": 0,
                "version": 1
            }
        }
        
        # Should not raise exception
        root_id = lexical_to_loro_tree(empty_children_lexical, self.tree)
        self.assertIsNotNone(root_id)
        
        # Should create at least the root node
        all_nodes = self.tree.nodes()
        self.assertGreaterEqual(len(all_nodes), 1)

    def test_no_children_handling(self):
        """Test handling of nodes without children property"""
        no_children_lexical = {
            "root": {
                "type": "text",
                "text": "Standalone text",
                "format": 0,
                "mode": "normal",
                "style": "",
                "detail": 0,
                "version": 1
                # No children property
            }
        }
        
        # Should not raise exception  
        root_id = lexical_to_loro_tree(no_children_lexical, self.tree)
        self.assertIsNotNone(root_id)
        
        # Should create the root node
        all_nodes = self.tree.nodes()
        self.assertGreaterEqual(len(all_nodes), 1)

    def test_tree_hierarchy_preservation(self):
        """Test that parent-child relationships are preserved in Loro tree"""
        hierarchical_lexical = {
            "root": {
                "type": "root",
                "children": [{
                    "type": "paragraph",
                    "children": [
                        {"type": "text", "text": "First", "format": 0, "mode": "normal", "style": "", "detail": 0, "version": 1},
                        {"type": "text", "text": "Second", "format": 0, "mode": "normal", "style": "", "detail": 0, "version": 1}
                    ],
                    "direction": None,
                    "format": "", 
                    "indent": 0,
                    "version": 1
                }],
                "direction": None,
                "format": "",
                "indent": 0, 
                "version": 1
            }
        }
        
        root_id = lexical_to_loro_tree(hierarchical_lexical, self.tree)
        
        # Verify tree structure using Loro's tree methods
        all_nodes = self.tree.nodes()
        roots = self.tree.roots
        
        # Should have one root
        self.assertEqual(len(roots), 1)
        
        # Should have multiple total nodes (root + paragraph + 2 text nodes)
        self.assertGreaterEqual(len(all_nodes), 4)


if __name__ == '__main__':
    # Run the tests
    unittest.main(verbosity=2)