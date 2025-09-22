"""
Lexical to Loro Tree converter for Python
Matches the TypeScript lexicalToLoroTree implementation for consistent initialization
"""

import json
import random
import string
from typing import Dict, Any, List, Optional
from loro import LoroDoc, LoroTree
from ..constants import DEFAULT_TREE_NAME

# Python equivalent of INITIAL_LEXICAL_JSON from TypeScript
INITIAL_LEXICAL_JSON = {
    "root": {
        "children": [
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Lexical with Loro",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "heading",
                "version": 1,
                "tag": "h1"
            },
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal", 
                        "style": "",
                        "text": "Type something...",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1,
                "textFormat": 0,
                "textStyle": ""
            }
        ],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    }
}

def generate_node_key() -> str:
    """Generate a simple node key for temporary use"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))

def lexical_to_loro_tree(lexical_json: Dict[str, Any], tree: LoroTree, logger=None) -> str:
    """
    Convert a Lexical JSON structure to a Loro tree
    This is used to initialize a Loro tree from existing Lexical content
    
    Uses Loro 1.6.0 API:
    - tree.create() returns TreeID
    - tree.get_meta(tree_id) returns LoroMap for metadata storage
    - tree.create_at(index, parent_id) creates child nodes
    """
    if logger:
        logger.info(f"[Converter] Starting conversion of Lexical JSON to Loro tree")
        logger.info(f"[Converter] Input Lexical JSON keys: {list(lexical_json.keys())}")
    
    # Start with the root node - create it without a parent
    # tree.create() returns TreeID in Loro 1.6.0
    root_tree_id = tree.create()
    if logger:
        logger.info(f"[Converter] Created root tree node ID: {root_tree_id}")
    
    # Process the root node
    process_lexical_node(lexical_json["root"], tree, root_tree_id, logger)
    
    root_tree_id_str = str(root_tree_id)
    if logger:
        logger.info(f"[Converter] Finished conversion, root tree ID: {root_tree_id_str}")
    
    return root_tree_id_str

def process_lexical_node(lexical_node: Dict[str, Any], tree: LoroTree, tree_id, logger=None, depth: int = 0) -> None:
    """
    Recursively process a Lexical node and add it to the Loro tree
    
    Uses Loro 1.6.0 API:
    - tree_id is TreeID object
    - tree.get_meta(tree_id) returns LoroMap for metadata storage
    - tree.create_at(index, parent_id) creates child nodes
    
    Args:
        lexical_node: Lexical node data as dictionary
        tree: LoroTree instance 
        tree_id: TreeID object
        logger: Logger instance
        depth: Current recursion depth
    """
    indent = "  " * depth
    if logger:
        logger.info(f"[Converter] {indent}Processing node type '{lexical_node.get('type', 'unknown')}' at tree ID: {tree_id}")
    
    try:
        # Store the lexical data using Loro 1.6.0 metadata API
        meta_map = tree.get_meta(tree_id)
        
        # Store element type for quick access (matching TypeScript pattern)
        meta_map.insert('elementType', lexical_node.get('type', ''))
        
        # Store lexical node data directly (no need for complex conversion)
        # Remove key-related fields to avoid duplication (TreeID serves as the key)
        cleaned_data = {k: v for k, v in lexical_node.items() 
                       if k not in ['__key', 'key', 'lexicalKey', 'children']}
        
        # Store cleaned lexical data
        meta_map.insert('lexical', cleaned_data)
        
        if logger:
            logger.info(f"[Converter] {indent}Stored node data - type: {lexical_node.get('type')}, lexical keys: {list(cleaned_data.keys())}")
            if 'text' in lexical_node:
                logger.info(f"[Converter] {indent}Text content: '{lexical_node['text']}'")
    
    except Exception as e:
        if logger:
            logger.error(f"[Converter] {indent}Error storing node data: {e}")
        raise
    
    # Process children if they exist
    if 'children' in lexical_node and isinstance(lexical_node['children'], list):
        if logger:
            logger.info(f"[Converter] {indent}Processing {len(lexical_node['children'])} children")
        
        for child_index, child in enumerate(lexical_node['children']):
            try:
                # Create child node using Loro 1.6.0 API: create_at(index, parent_id)
                child_tree_id = tree.create_at(child_index, tree_id)
                
                if logger:
                    logger.info(f"[Converter] {indent}Created child node {child_index} with ID: {child_tree_id}")
                
                process_lexical_node(child, tree, child_tree_id, logger, depth + 1)
            except Exception as e:
                if logger:
                    logger.error(f"[Converter] {indent}Error processing child {child_index}: {e}")
                raise

def create_lexical_node_from_json(node_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create a minimal Lexical node representation from JSON data
    This doesn't create actual Lexical nodes, just the data structure needed for serialization
    """
    # Create a minimal node-like object with the essential properties
    node_data = {
        '__key': generate_node_key(),  # Generate a temporary key
        '__type': node_json.get('type', ''),
        '__parent': None,  # Will be set during tree construction
        '__text': node_json.get('text'),
        '__format': node_json.get('format', 0),
        '__style': node_json.get('style', ''),
        '__mode': node_json.get('mode'),
        '__detail': node_json.get('detail'),
        '__indent': node_json.get('indent', 0),
        '__direction': node_json.get('direction'),
        '__tag': node_json.get('tag'),
        '__textFormat': node_json.get('textFormat'),
        '__textStyle': node_json.get('textStyle'),
        '__version': node_json.get('version', 1)
    }

    # Remove None/undefined properties
    cleaned_data = {k: v for k, v in node_data.items() if v is not None}

    # Return in the format expected by the converter
    return {
        'lexical_node': {
            'get_type': lambda: node_json.get('type', ''),
            'export_json': lambda: cleaned_data,
            'get_key': lambda: cleaned_data['__key']
        }
    }

def initialize_loro_doc_with_lexical_content(doc: LoroDoc, logger=None) -> None:
    """
    Initialize a new Loro document with the initial Lexical content
    This ensures consistent starting state across all clients
    """
    if logger:
        logger.info(f"[Converter] Initializing Loro document with Lexical content")
    
    tree = doc.get_tree(DEFAULT_TREE_NAME)
    tree.enable_fractional_index(1)  # Use integer instead of float
    
    if logger:
        logger.info(f"[Converter] Enabled fractional index, starting conversion...")
    
    # Convert the initial Lexical JSON to Loro tree structure
    root_id = lexical_to_loro_tree(INITIAL_LEXICAL_JSON, tree, logger)
    
    if logger:
            # Log the final tree structure
            try:
                all_nodes = tree.nodes()  # method
                roots = tree.roots        # property
                logger.info(f"[Converter] Final tree statistics:")
                logger.info(f"[Converter]   Total nodes: {len(all_nodes)}")
                logger.info(f"[Converter]   Root nodes: {len(roots)}")
                logger.info(f"[Converter]   Main root ID: {root_id}")
                
                # Log some node details (all_nodes contains TreeID objects, not TreeNode objects)
                try:
                    for i, tree_id in enumerate(all_nodes[:5]):  # First 5 tree IDs
                        try:
                            logger.info(f"[Converter]   Node {i}: TreeID {tree_id}")
                        except Exception as e:
                            logger.info(f"[Converter]   Node {i}: TreeID access error: {e}")
                except Exception as e:
                    logger.info(f"[Converter]   Could not retrieve tree ID details: {e}")
                        
            except Exception as e:
                logger.warning(f"[Converter] Error logging tree structure: {e}")

def is_loro_document_empty(doc: LoroDoc) -> bool:
    """
    Check if a Loro document is empty (has no tree content)
    """
    tree = doc.get_tree(DEFAULT_TREE_NAME)
    
    try:
        # Get all root nodes (property, not method)
        roots = tree.roots
        # Also check if the document has any nodes at all (method)
        all_nodes = tree.nodes()
        return len(roots) == 0 and len(all_nodes) == 0
    except Exception:
        # If there's an error accessing roots, consider it empty
        return True

def should_initialize_loro_doc(doc: LoroDoc) -> bool:
    """
    Check if a Loro document should be initialized (more robust check)
    This helps prevent race conditions where multiple clients try to initialize
    """
    tree = doc.get_tree(DEFAULT_TREE_NAME)
    
    try:
        all_nodes = tree.nodes()  # method
        roots = tree.roots       # property
        
        # Only initialize if there are truly no nodes
        is_empty = len(all_nodes) == 0
        
        # Additional check: look for any existing root nodes with our content
        if not is_empty:
            # Check if any root has the expected initial structure
            try:
                tree_value = tree.get_value()
                for node_info in tree_value:
                    if node_info['id'] in roots:
                        # Check if this root node has lexical data
                        try:
                            meta_container_id = node_info['meta']
                            node_data_map = doc.get_map(meta_container_id)
                            if 'elementType' in node_data_map and node_data_map['elementType'] == 'root':
                                return False
                        except Exception:
                            continue
            except Exception:
                pass
        
        return is_empty
    except Exception:
        return False  # Don't initialize if there's an error