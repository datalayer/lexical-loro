#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Debug script to understand LoroMap API
"""

import json
import logging
from pathlib import Path
import sys

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from loro import LoroDoc
from lexical_loro.constants import DEFAULT_TREE_NAME

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_loro_map_api():
    """Debug the LoroMap API to understand correct usage"""
    logger.info("🔍 Debugging LoroMap API")
    
    # Create a simple document
    doc = LoroDoc()
    tree = doc.get_tree(DEFAULT_TREE_NAME)
    
    # Create a node
    root_id = tree.create()
    
    # Get metadata map
    meta_map = tree.get_meta(root_id)
    
    logger.info(f"Meta map type: {type(meta_map)}")
    logger.info(f"Meta map methods: {[method for method in dir(meta_map) if not method.startswith('_')]}")
    
    # Try to set some values
    try:
        meta_map.insert('elementType', 'root')
        meta_map.insert('lexical', {'type': 'root', 'version': 1})
        logger.info("✅ Successfully inserted values")
    except Exception as e:
        logger.error(f"❌ Error inserting values: {e}")
        return
    
    # Try to retrieve values - test different methods
    logger.info("\n🔍 Testing value retrieval methods:")
    
    # Method 1: get()
    try:
        element_type = meta_map.get('elementType')
        logger.info(f"✅ meta_map.get('elementType'): {element_type}")
    except Exception as e:
        logger.error(f"❌ meta_map.get() failed: {e}")
    
    # Method 2: Dictionary-style access
    try:
        element_type = meta_map['elementType']
        logger.info(f"✅ meta_map['elementType']: {element_type}")
    except Exception as e:
        logger.error(f"❌ Dictionary access failed: {e}")
    
    # Method 3: Check if key exists using 'in'
    try:
        has_key = 'elementType' in meta_map
        logger.info(f"✅ 'elementType' in meta_map: {has_key}")
    except Exception as e:
        logger.error(f"❌ 'in' check failed: {e}")
    
    # Method 4: Try to iterate
    try:
        keys = list(meta_map)
        logger.info(f"✅ Keys from iteration: {keys}")
    except Exception as e:
        logger.error(f"❌ Iteration failed: {e}")
    
    # Method 5: Try keys() method
    try:
        keys = meta_map.keys()
        logger.info(f"✅ Keys from .keys(): {list(keys)}")
    except Exception as e:
        logger.error(f"❌ .keys() method failed: {e}")
    
    # Method 6: Try values() method
    try:
        values = meta_map.values()
        logger.info(f"✅ Values from .values(): {list(values)}")
    except Exception as e:
        logger.error(f"❌ .values() method failed: {e}")

if __name__ == "__main__":
    try:
        debug_loro_map_api()
    except Exception as e:
        logger.error(f"❌ Debug failed: {e}")
        import traceback
        logger.error(traceback.format_exc())