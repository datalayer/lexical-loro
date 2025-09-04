#!/usr/bin/env python3

"""
Test script to verify incremental update functionality in LexicalModel.
"""

import asyncio
import sys
import logging
from pathlib import Path

# Add the package path
sys.path.insert(0, str(Path(__file__).parent))

from lexical_loro.model.lexical_model import LexicalModel, LexicalDocumentManager

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_incremental_updates():
    """Test incremental update functionality"""
    logger.info("🧪 Testing incremental update functionality...")
    
    try:
        # Create a document manager
        doc_manager = LexicalDocumentManager()
        
        # Create a document
        doc_id = "test-incremental"
        model = doc_manager.get_or_create_document(doc_id)
        
        logger.info(f"📄 Created document: {doc_id}")
        
        # Test 1: Check initial state
        logger.info("🔍 Test 1: Check initial broadcast data...")
        initial_data = model.get_broadcast_data(prefer_incremental=True)
        logger.info(f"Initial broadcast data: {initial_data}")
        
        # Test 2: Add a paragraph and check for updates
        logger.info("🔍 Test 2: Add paragraph and check for incremental updates...")
        
        # Add a paragraph
        result = await model.add_block_at_index(0, {"text": "Test paragraph 1"}, "paragraph")
        logger.info(f"Add paragraph result: {result}")
        
        # Check for broadcast data
        after_add_data = model.get_broadcast_data(prefer_incremental=True)
        logger.info(f"After add broadcast data: {after_add_data}")
        
        # Test 3: Add another paragraph 
        logger.info("🔍 Test 3: Add second paragraph...")
        
        result2 = await model.add_block_at_index(1, {"text": "Test paragraph 2"}, "paragraph")
        logger.info(f"Add second paragraph result: {result2}")
        
        # Check for broadcast data again
        after_second_data = model.get_broadcast_data(prefer_incremental=True)
        logger.info(f"After second add broadcast data: {after_second_data}")
        
        # Test 4: Check version tracking
        logger.info("🔍 Test 4: Check version tracking...")
        has_changes = model.has_changes_since_last_broadcast()
        logger.info(f"Has changes since last broadcast: {has_changes}")
        
        # Mark as broadcast and check again
        model.mark_version_as_broadcast()
        has_changes_after_mark = model.has_changes_since_last_broadcast()
        logger.info(f"Has changes after marking as broadcast: {has_changes_after_mark}")
        
        # Test 5: Add another change and check
        logger.info("🔍 Test 5: Add change after marking broadcast...")
        result3 = await model.add_block_at_index(2, {"text": "Test paragraph 3"}, "paragraph")
        logger.info(f"Add third paragraph result: {result3}")
        
        has_changes_after_new = model.has_changes_since_last_broadcast()
        logger.info(f"Has changes after new addition: {has_changes_after_new}")
        
        final_data = model.get_broadcast_data(prefer_incremental=True)
        logger.info(f"Final broadcast data: {final_data}")
        
        logger.info("✅ Incremental update test completed!")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")

if __name__ == "__main__":
    asyncio.run(test_incremental_updates())
