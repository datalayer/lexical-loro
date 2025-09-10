#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test the fixed MCP server with correct message types
"""

import asyncio
import logging
from lexical_loro.model import LexicalDocumentManager

# Set up logging
logging.basicConfig(level=logging.INFO)

async def test_fixed_mcp():
    """Test the fixed MCP server functionality"""
    print("🔧 TESTING FIXED MCP SERVER")
    print("=" * 40)
    
    # Initialize the global document manager (as MCP server does)
    import lexical_loro.mcp.server as server_module
    server_module.document_manager = LexicalDocumentManager()
    
    # Enable client mode to test broadcasting
    server_module.document_manager.client_mode = True
    
    doc_id = "test-fixed-mcp"
    
    # Import the actual MCP functions
    from lexical_loro.mcp.server import append_paragraph, insert_paragraph
    
    print(f"📋 Testing with document: {doc_id}")
    print("-" * 30)
    
    # Test append (should now use 'snapshot' message type)
    try:
        result = await append_paragraph("Test append - fixed!", doc_id)
        print(f"✅ Append result: {result}")
    except Exception as e:
        print(f"❌ Append failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test insert (should now use 'snapshot' message type)
    try:
        result = await insert_paragraph(0, "Test insert - fixed!", doc_id)
        print(f"✅ Insert result: {result}")
    except Exception as e:
        print(f"❌ Insert failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test cleanup
    try:
        server_module.document_manager.cleanup()
        print(f"✅ Cleanup completed without errors")
    except Exception as e:
        print(f"❌ Cleanup failed: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"\n🔧 FIXED MCP SERVER TEST COMPLETED")
    print("=" * 40)

if __name__ == "__main__":
    asyncio.run(test_fixed_mcp())
