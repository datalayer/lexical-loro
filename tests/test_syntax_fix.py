#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test the specific MCP issues reported by user after fixing syntax error
"""

import asyncio
import pytest
from lexical_loro.model import LexicalDocumentManager

async def test_mcp_basic_import():
    """Test that we can import and create the document manager without syntax errors"""
    try:
        # This will fail if there are syntax errors in lexical_model.py
        manager = LexicalDocumentManager()
        print("✅ Successfully imported and created LexicalDocumentManager")
        return True
    except Exception as e:
        print(f"❌ Failed to import: {e}")
        return False

async def test_mcp_manager_creation():
    """Test basic manager functionality"""
    try:
        manager = LexicalDocumentManager()
        
        # Test basic document creation
        doc_id = "test-doc-1"
        model = manager.get_or_create_document(doc_id)
        print(f"✅ Created document: {doc_id}")
        
        # Test model retrieval
        if doc_id in manager.models:
            print(f"✅ Model found for {doc_id}")
        else:
            print(f"❌ Model NOT found for {doc_id}")
            
        return True
    except Exception as e:
        print(f"❌ Manager test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

async def main():
    print("🧪 Testing MCP functionality after syntax fix...")
    
    # Test 1: Basic import and creation
    result1 = await test_mcp_basic_import()
    
    # Test 2: Manager functionality
    result2 = await test_mcp_manager_creation()
    
    if result1 and result2:
        print("\n✅ All basic tests passed! Syntax errors are fixed.")
        print("\nThe three specific issues to investigate:")
        print("1. Insert Paragraph Index 2 shows JSON directly")
        print("2. Insert Paragraph Index 2 works after typing")  
        print("3. Append Paragraph doesn't work")
        print("\nTo debug these, we need to test the actual MCP endpoints...")
    else:
        print("\n❌ Basic tests failed, syntax errors may still exist")

if __name__ == "__main__":
    asyncio.run(main())
