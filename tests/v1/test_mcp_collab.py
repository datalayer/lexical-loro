#!/usr/bin/env python3
"""
Test MCP append with proper collaborative setup
"""

import asyncio
import json
from lexical_loro.mcp.server import initialize_mcp_collaboration, document_manager, append_paragraph

async def test_mcp_with_collaboration():
    """Test MCP append with full collaborative setup"""
    print("🚀 Testing MCP append with collaborative setup")
    print("=" * 50)
    
    # Initialize MCP collaboration to establish WebSocket connection
    print("🔌 Initializing MCP collaboration...")
    await initialize_mcp_collaboration()
    
    # Wait for connection to stabilize
    await asyncio.sleep(2)
    
    print(f"✅ WebSocket connected: {document_manager.connected}")
    
    # Ensure we're working on the shared document
    shared_doc_id = "lexical-shared-doc"
    print(f"📄 Working with document: {shared_doc_id}")
    
    # The document manager should already be connected to this document
    # Let's check current state
    current_doc = document_manager.current_model
    if current_doc:
        print(f"📋 Current document has {len(current_doc.lexical_data.get('root', {}).get('children', []))} blocks")
    else:
        print("⚠️ No current document model")
    
    # Now append a paragraph
    test_text = "🚀 Hello from MCP with collaborative setup!"
    print(f"\n➕ Appending paragraph: '{test_text}'")
    
    result = await append_paragraph(test_text, shared_doc_id)
    print(f"📤 Append result: {json.dumps(result, indent=2)}")
    
    # Wait for propagation
    await asyncio.sleep(2)
    
    # Check final state
    if current_doc:
        final_blocks = len(current_doc.lexical_data.get('root', {}).get('children', []))
        print(f"📊 Document now has {final_blocks} blocks")
    
    print("\n✅ Test completed!")
    print("🌐 Changes should now be visible in browser at http://localhost:3000")

if __name__ == "__main__":
    asyncio.run(test_mcp_with_collaboration())
