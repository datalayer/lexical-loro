#!/usr/bin/env python3
# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test script to directly call the MCP append function and see if it works
"""

import asyncio
import sys
import os

# Add the package to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lexical_loro.mcp.server import append_paragraph, set_current_document

async def test_append():
    """Test the append functionality directly"""
    print("🧪 Testing MCP append functionality...")
    
    # Set the current document to match what the browser uses
    doc_id = "lexical-shared-doc"
    
    print(f"📄 Setting current document to: {doc_id}")
    result = await set_current_document(doc_id)
    print(f"✅ Set document result: {result}")
    
    # Try to append a paragraph
    test_text = "Hello from direct MCP test!"
    print(f"➕ Appending text: '{test_text}'")
    
    result = await append_paragraph(test_text)
    print(f"📤 Append result: {result}")
    
    # Give some time for any async operations to complete
    await asyncio.sleep(2)
    
    print("🧪 Test completed!")

if __name__ == "__main__":
    asyncio.run(test_append())
