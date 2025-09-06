#!/usr/bin/env python3

"""
Test script to debug MCP append paragraph issue.
This will help us trace exactly what happens when MCP is called.
"""

import asyncio
import logging
import json
import websockets
import time

# Configure logging to see all debug messages
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

async def test_mcp_flow():
    """Test the MCP append paragraph flow and trace the issue"""
    
    print("🧪 TESTING MCP APPEND PARAGRAPH FLOW")
    print("=" * 50)
    
    # Step 1: Import and create document manager
    from lexical_loro.model.lexical_model import LexicalDocumentManager
    
    print("\n📋 Step 1: Creating document manager...")
    doc_manager = LexicalDocumentManager(
        event_callback=lambda event_type, event_data: print(f"🔔 EVENT: {event_type} - {event_data}"),
        ephemeral_timeout=300000,
        client_mode=False  # Start in non-client mode for this test
    )
    
    doc_id = "test-mcp-debug"
    
    # Step 2: Create/get document
    print(f"\n📋 Step 2: Getting document '{doc_id}'...")
    model = doc_manager.get_or_create_document(doc_id)
    
    # Check initial state
    initial_blocks = len(model.lexical_data.get("root", {}).get("children", []))
    print(f"📊 Initial blocks: {initial_blocks}")
    print(f"📊 Initial lexical_data: {json.dumps(model.lexical_data, indent=2)}")
    
    # Step 3: Call append_paragraph via MCP message handler
    print(f"\n📋 Step 3: Calling append_paragraph via message handler...")
    
    message_data = {
        "message": "Test paragraph from MCP debug script",
        "position": "end"
    }
    
    print(f"🔍 Message data: {message_data}")
    
    # Call the message handler
    try:
        result = await doc_manager.handle_message(doc_id, "append-paragraph", message_data)
        print(f"✅ Message handler result: {json.dumps(result, indent=2)}")
    except Exception as e:
        print(f"❌ Message handler failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Step 4: Check state after append
    print(f"\n📋 Step 4: Checking state after append...")
    
    blocks_after = len(model.lexical_data.get("root", {}).get("children", []))
    print(f"📊 Blocks after append: {blocks_after}")
    print(f"📊 Block count change: {initial_blocks} -> {blocks_after}")
    
    if blocks_after > initial_blocks:
        print("✅ Block was added successfully!")
        # Print the new block
        new_block = model.lexical_data["root"]["children"][-1]
        print(f"📝 New block: {json.dumps(new_block, indent=2)}")
    else:
        print("❌ No block was added - this is the bug!")
    
    # Step 5: Check CRDT state
    print(f"\n📋 Step 5: Checking CRDT state...")
    
    try:
        text_container = model.text_doc.get_text(model.container_id or "content")
        crdt_content = text_container.to_string()
        crdt_length = text_container.len_unicode
        print(f"📊 CRDT content length: {crdt_length}")
        print(f"📊 CRDT content preview: {crdt_content[:200]}...")
        
        # Try to parse CRDT content as JSON
        try:
            crdt_data = json.loads(crdt_content)
            crdt_blocks = len(crdt_data.get("root", {}).get("children", []))
            print(f"📊 CRDT blocks: {crdt_blocks}")
            
            if crdt_blocks != blocks_after:
                print(f"⚠️ MISMATCH: lexical_data has {blocks_after} blocks, CRDT has {crdt_blocks} blocks")
                print("🔍 This suggests a synchronization issue!")
            else:
                print(f"✅ SYNC OK: Both lexical_data and CRDT have {blocks_after} blocks")
        except json.JSONDecodeError as e:
            print(f"❌ CRDT content is not valid JSON: {e}")
            print(f"📄 Raw CRDT content: {repr(crdt_content)}")
    except Exception as e:
        print(f"❌ Error checking CRDT state: {e}")
    
    # Step 6: Try calling append_paragraph again
    print(f"\n📋 Step 6: Calling append_paragraph AGAIN to test repetition...")
    
    message_data_2 = {
        "message": "Second test paragraph from MCP debug script",
        "position": "end"
    }
    
    print(f"🔍 Second message data: {message_data_2}")
    
    # Call the message handler again
    try:
        result_2 = await doc_manager.handle_message(doc_id, "append-paragraph", message_data_2)
        print(f"✅ Second message handler result: {json.dumps(result_2, indent=2)}")
    except Exception as e:
        print(f"❌ Second message handler failed: {e}")
        import traceback
        traceback.print_exc()
        return
    
    # Check state after second append
    blocks_final = len(model.lexical_data.get("root", {}).get("children", []))
    print(f"📊 Final blocks: {blocks_final}")
    print(f"📊 Block progression: {initial_blocks} -> {blocks_after} -> {blocks_final}")
    
    if blocks_final > blocks_after:
        print("✅ Second block was added successfully!")
    else:
        print("❌ Second block was NOT added - confirming the issue!")
    
    # Step 7: Get final lexical data
    print(f"\n📋 Step 7: Final state summary...")
    final_data = model.get_lexical_data()
    final_block_count = len(final_data.get("root", {}).get("children", []))
    print(f"📊 Final lexical_data blocks: {final_block_count}")
    
    print("\n🧪 TEST COMPLETED")
    print("=" * 50)

if __name__ == "__main__":
    asyncio.run(test_mcp_flow())
