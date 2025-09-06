#!/usr/bin/env python3

"""
Test script to reproduce the issue:
1. MCP append works fine
2. User types in browser 
3. MCP append again fails with PoisonError

This simulates the collaborative editing scenario where browser changes
can cause JSON corruption that leads to CRDT poisoning.
"""

import asyncio
import json
import sys
import os

# Add the project root to the path
sys.path.insert(0, os.path.abspath('.'))

from lexical_loro.mcp.server import initialize_mcp_collaboration, append_paragraph
from lexical_loro.model.lexical_model import LexicalDocumentManager

async def simulate_browser_typing(doc_manager: LexicalDocumentManager, doc_id: str):
    """Simulate a user typing in the browser by sending a collaborative update"""
    print("👤 Simulating browser typing...")
    
    # Get the current document
    model = doc_manager.get_or_create_document(doc_id)
    
    # Simulate a text insertion that might cause JSON corruption
    # This simulates what happens when a user types and it gets processed as a collaborative update
    malformed_update = {
        "type": "loro-update", 
        "docId": doc_id,
        "senderId": "browser_user",
        "update": [1, 2, 3, 4, 5]  # Simulated malformed update data
    }
    
    try:
        # Try to process this update - this might cause corruption
        print("🔄 Processing simulated browser update...")
        # This simulates what happens when collaborative changes come in
        await doc_manager._process_websocket_message(malformed_update)
    except Exception as e:
        print(f"⚠️ Expected error from malformed update: {e}")

async def test_mcp_type_mcp_scenario():
    """Test the MCP → type → MCP scenario"""
    print("🧪 Testing MCP → User Types → MCP scenario")
    print("=" * 50)
    
    try:
        # Initialize MCP collaboration
        print("1️⃣ Initializing MCP collaboration...")
        await initialize_mcp_collaboration()
        await asyncio.sleep(1)
        
        # First MCP append (should work)
        print("\n2️⃣ First MCP append...")
        result1 = await append_paragraph("First MCP message", "lexical-shared-doc")
        print(f"📤 Result 1: {result1}")
        
        await asyncio.sleep(1)
        
        # Simulate user typing in browser (this might corrupt the state)
        print("\n3️⃣ Simulating user typing...")
        from lexical_loro.mcp.server import document_manager
        await simulate_browser_typing(document_manager, "lexical-shared-doc")
        
        await asyncio.sleep(1)
        
        # Second MCP append (might fail with PoisonError)
        print("\n4️⃣ Second MCP append (testing for PoisonError)...")
        try:
            result2 = await append_paragraph("Second MCP message after typing", "lexical-shared-doc")
            print(f"📤 Result 2: {result2}")
            print("✅ SUCCESS: Second MCP append worked after typing!")
        except Exception as e:
            print(f"❌ FAILED: Second MCP append failed: {e}")
            if "PoisonError" in str(e):
                print("🔥 Confirmed: This is the PoisonError we're trying to fix!")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_mcp_type_mcp_scenario())
    if success:
        print("\n🎉 Test completed successfully!")
    else:
        print("\n💥 Test failed - PoisonError reproduction confirmed")
    sys.exit(0 if success else 1)
