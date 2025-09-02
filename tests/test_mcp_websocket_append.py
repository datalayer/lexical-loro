#!/usr/bin/env python3
"""
Test MCP with explicit WebSocket collaborative connection
"""

import asyncio
import json
from lexical_loro.mcp.server import append_paragraph, document_manager, initialize_mcp_collaboration

async def test_with_websocket_connection():
    """Test MCP append with explicit WebSocket collaborative connection"""
    print("🚀 Testing MCP with WebSocket collaborative connection")
    print("=" * 60)
    
    # Initialize MCP collaboration to establish WebSocket connection
    print("🔌 Establishing WebSocket connection...")
    await initialize_mcp_collaboration()
    
    # Wait for connection and let any initial sync happen
    await asyncio.sleep(3)
    
    print(f"🔗 WebSocket connected: {document_manager.connected}")
    print(f"📋 Available models: {document_manager.list_models()}")
    
    # Create or get the shared document 
    shared_doc_id = "lexical-shared-doc"
    model = document_manager.get_or_create_document(shared_doc_id)
    print(f"📄 Working with document: {shared_doc_id}")
    
    # Check current state after WebSocket sync
    current_blocks = len(model.lexical_data.get('root', {}).get('children', []))
    print(f"📊 Document currently has {current_blocks} blocks")
    
    # Now append a paragraph
    test_text = "🌐 Hello from MCP with WebSocket collaboration!"
    print(f"\n➕ Appending: '{test_text}'")
    
    result = await append_paragraph(test_text, shared_doc_id)
    print(f"📤 Result: {json.dumps(result, indent=2)}")
    
    # Wait for propagation
    await asyncio.sleep(2)
    
    # Check final state
    final_blocks = len(model.lexical_data.get('root', {}).get('children', []))
    print(f"📊 Document now has {final_blocks} blocks")
    
    print(f"\n✅ Test completed!")
    print(f"🌐 Changes should be visible in browser at http://localhost:3000")
    print(f"📝 Check if the new paragraph appears: '{test_text}'")

if __name__ == "__main__":
    asyncio.run(test_with_websocket_connection())
