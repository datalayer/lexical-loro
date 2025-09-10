#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.


import asyncio
import sys
import os

# Add the current directory to sys.path to import lexical_loro
sys.path.insert(0, os.path.abspath('.'))

from lexical_loro.mcp.server import mcp, document_manager

async def test_get_document_info():
    """Test the get_document_info MCP tool to see current document state"""
    try:
        # Initialize document manager if not already done
        if document_manager is None:
            print("❌ Document manager not initialized")
            return
            
        print("🔍 Getting document info for 'example-1'...")
        
        # Call the get_document_info tool
        result = await mcp.call_tool('get_document_info', {'document_id': 'example-1'})
        
        print("📄 Document Info Result:")
        print("=" * 60)
        if result.content:
            for content in result.content:
                if hasattr(content, 'text'):
                    print(content.text)
                else:
                    print(content)
        else:
            print("No content returned")
        print("=" * 60)
            
    except Exception as e:
        print(f"❌ Error getting document info: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_get_document_info())
