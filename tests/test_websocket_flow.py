#!/usr/bin/env python3
"""
Debug the WebSocket broadcast flow to identify why MCP changes aren't appearing in the frontend
"""

import asyncio
import logging
from lexical_loro.model import LexicalDocumentManager

# Set up detailed logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

async def test_websocket_broadcast_flow():
    """Test the complete WebSocket broadcast flow"""
    print("🔧 TESTING WEBSOCKET BROADCAST FLOW")
    print("=" * 50)
    
    # Create document manager in client mode (simulating MCP server setup)
    manager = LexicalDocumentManager()
    
    # Test 1: Check if client_mode is set
    print(f"\n📋 Test 1: Client Mode Configuration")
    print(f"client_mode: {manager.client_mode}")
    print(f"websocket_clients: {manager.websocket_clients}")
    
    # Test 2: Simulate setting client mode (as would happen when connecting to WebSocket)
    doc_id = "debug-websocket-test"
    print(f"\n📋 Test 2: Simulating WebSocket Connection")
    
    # This simulates what happens when the frontend connects
    manager.client_mode = True
    manager.websocket_clients[doc_id] = {
        "connected": True,
        "client_id": "debug-client-123",
        "websocket": "mock-websocket"  # In real scenario this would be actual WebSocket
    }
    
    print(f"After setup:")
    print(f"client_mode: {manager.client_mode}")
    print(f"websocket_clients[{doc_id}]: {manager.websocket_clients.get(doc_id)}")
    
    # Test 3: Create document and make changes
    print(f"\n📋 Test 3: Creating Document and Testing Broadcast")
    
    model = manager.get_or_create_document(doc_id)
    
    # Test broadcast_change method directly
    print(f"Calling broadcast_change directly...")
    try:
        await manager.broadcast_change(doc_id, "document-update")
        print(f"✅ broadcast_change call completed")
    except Exception as e:
        print(f"❌ broadcast_change failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 4: Check _send_message method (this is what actually sends WebSocket messages)
    print(f"\n📋 Test 4: Testing _send_message Method")
    
    # Create a test message
    test_message = {
        "type": "document-update",
        "docId": doc_id,
        "senderId": "debug-client-123",
        "snapshot": [1, 2, 3, 4, 5]  # Small test snapshot
    }
    
    try:
        await manager._send_message(doc_id, test_message)
        print(f"✅ _send_message call completed")
    except Exception as e:
        print(f"❌ _send_message failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 5: Simulate MCP server flow
    print(f"\n📋 Test 5: Simulating Full MCP Server Flow")
    
    # Initialize the global document manager (as MCP server does)
    import lexical_loro.mcp.server as server_module
    server_module.document_manager = manager
    
    # Import and test the actual MCP functions
    from lexical_loro.mcp.server import append_paragraph
    
    try:
        result = await append_paragraph("Debug test paragraph", doc_id)
        print(f"MCP append_paragraph result: {result}")
        
        # Check if document was actually modified
        lexical_data = model.get_lexical_data()
        blocks = lexical_data.get("root", {}).get("children", [])
        print(f"Blocks after MCP call: {len(blocks)}")
        
        if len(blocks) > 0:
            text = blocks[-1].get("children", [{}])[0].get("text", "NO TEXT")
            print(f"Last block text: '{text}'")
        
    except Exception as e:
        print(f"❌ MCP append_paragraph failed: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"\n🔧 WEBSOCKET BROADCAST FLOW TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_websocket_broadcast_flow())
