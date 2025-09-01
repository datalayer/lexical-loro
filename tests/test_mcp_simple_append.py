#!/usr/bin/env python3
"""
Simple test for MCP append functionality with document verification
"""

import asyncio
import json
from lexical_loro.mcp.server import append_paragraph, document_manager

async def test_simple_append():
    """Simple test for appending to the shared document"""
    print("🚀 Testing MCP append functionality")
    print("=" * 40)
    
    # Give a moment for any initialization
    await asyncio.sleep(1)
    
    # Check what documents are available
    doc_list = document_manager.list_documents()
    print(f"📋 Available documents: {doc_list}")
    
    # Check if lexical-shared-doc exists and get its current state
    shared_doc_id = "lexical-shared-doc"
    if shared_doc_id in document_manager.documents:
        model = document_manager.documents[shared_doc_id]
        current_blocks = len(model.lexical_data.get('root', {}).get('children', []))
        print(f"📊 Document '{shared_doc_id}' currently has {current_blocks} blocks")
    else:
        print(f"⚠️ Document '{shared_doc_id}' not found in documents")
    
    # Append a paragraph with explicit document ID
    test_text = "🚀 MCP append test - this should appear in browser!"
    print(f"\n➕ Appending: '{test_text}'")
    
    result = await append_paragraph(test_text, shared_doc_id)
    print(f"📤 Result: {json.dumps(result, indent=2)}")
    
    # Wait for propagation
    await asyncio.sleep(2)
    
    # Check final state
    if shared_doc_id in document_manager.documents:
        model = document_manager.documents[shared_doc_id]
        final_blocks = len(model.lexical_data.get('root', {}).get('children', []))
        print(f"📊 Document '{shared_doc_id}' now has {final_blocks} blocks")
    
    print("\n✅ Test completed!")
    print("👀 Check browser at http://localhost:3000 for the new paragraph")

if __name__ == "__main__":
    asyncio.run(test_simple_append())
