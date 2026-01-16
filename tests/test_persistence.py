#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script for WebSocket server persistence functionality
"""

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path
import sys

# Add the project root to Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from lexical_loro.websocket.server import (
    LoroWebSocketServer, 
    default_load_model, 
    default_save_model,
    loro_tree_to_lexical_json,
    get_doc,
    clear_docs
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_persistence():
    """Test the persistence functionality"""
    logger.info("🧪 Testing WebSocket server persistence functionality")
    
    # Test 1: Default load/save functions
    logger.info("📋 Test 1: Default load/save functions")
    
    test_doc_id = "test-document-123"
    test_content = '{"root": {"type": "root", "children": []}}'
    
    # Test save
    success = default_save_model(test_doc_id, test_content)
    logger.info(f"   Save result: {success}")
    
    # Test load
    loaded_content = default_load_model(test_doc_id)
    logger.info(f"   Load result: {loaded_content is not None}")
    logger.info(f"   Content matches: {loaded_content.strip() == test_content}")
    
    # Test 2: Document creation and persistence
    logger.info("📋 Test 2: Document creation and persistence")
    
    clear_docs()
    doc = get_doc("test-doc-persistence")
    logger.info(f"   Document created: {doc.name}")
    logger.info(f"   Needs save: {doc.needs_save()}")
    
    # Mark as changed and test save
    doc.mark_changed()
    logger.info(f"   After mark_changed, needs save: {doc.needs_save()}")
    
    save_result = doc.save_to_persistence()
    logger.info(f"   Save to persistence: {save_result}")
    logger.info(f"   After save, needs save: {doc.needs_save()}")
    
    # Test 3: Loro tree to Lexical JSON conversion
    logger.info("📋 Test 3: Loro tree to Lexical JSON conversion")
    
    try:
        lexical_json = loro_tree_to_lexical_json(doc.doc)
        parsed = json.loads(lexical_json)
        logger.info(f"   Conversion successful: {len(lexical_json)} chars")
        logger.info(f"   Has root: {'root' in parsed}")
        logger.info(f"   Root type: {parsed.get('root', {}).get('type', 'unknown')}")
    except Exception as e:
        logger.error(f"   Conversion failed: {e}")
    
    # Test 4: Server class with autosave
    logger.info("📋 Test 4: Server class functionality")
    
    server = LoroWebSocketServer(
        host="localhost",
        port=3003,  # Different port to avoid conflicts
        autosave_interval_sec=5  # Short interval for testing
    )
    
    logger.info(f"   Server created - host: {server.host}, port: {server.port}")
    logger.info(f"   Autosave interval: {server.autosave_interval_sec}s")
    
    # Test manual save
    clear_docs()
    doc1 = get_doc("doc1")
    doc2 = get_doc("doc2")
    
    # Mark documents as changed
    doc1.mark_changed()
    doc2.mark_changed()
    
    save_results = server.save_all_models()
    logger.info(f"   Manual save results: {save_results}")
    
    # Cleanup test files
    logger.info("🧹 Cleaning up test files")
    try:
        models_dir = Path(".models")
        if models_dir.exists():
            for file in models_dir.glob("*.json"):
                if "test" in file.name:
                    file.unlink()
                    logger.info(f"   Removed: {file}")
    except Exception as e:
        logger.warning(f"   Cleanup error: {e}")
    
    logger.info("✅ Persistence tests completed")

if __name__ == "__main__":
    try:
        asyncio.run(test_persistence())
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        logger.error(traceback.format_exc())