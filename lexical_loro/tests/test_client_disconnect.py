#!/usr/bin/env python3
"""
Test client disconnect handling in Step 3 LexicalModel
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from lexical_loro.model.lexical_model import LexicalModel

def test_client_disconnect():
    """Test client disconnect handling"""
    print("\n🧪 Testing client disconnect handling...")
    
    model = LexicalModel.create_document("test-disconnect")
    
    # Add some ephemeral data for client1
    cursor_data = {
        "type": "cursor-position",
        "docId": "test-disconnect",
        "position": {"line": 1, "column": 5}
    }
    response = model.handle_ephemeral_message("cursor-position", cursor_data, "client1")
    assert response["success"] == True, "Failed to add cursor data"
    
    # Add some ephemeral data for client2
    awareness_data = {
        "type": "awareness-update",
        "docId": "test-disconnect", 
        "awarenessState": {"name": "User2", "cursor": {"line": 2, "column": 3}},
        "peerId": "client2"
    }
    response = model.handle_ephemeral_message("awareness-update", awareness_data, "client2")
    assert response["success"] == True, "Failed to add awareness data"
    
    # Verify both clients have data
    ephemeral_data_before = model.get_ephemeral_data()
    assert ephemeral_data_before is not None, "Should have ephemeral data before disconnect"
    
    print("✅ Added ephemeral data for client1 and client2")
    
    # Test disconnecting client1 (has data)
    response = model.handle_client_disconnect("client1")
    
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["message_type"] == "client-disconnect", f"Expected client-disconnect, got {response['message_type']}"
    assert response["broadcast_needed"] == True, "Should need broadcasting for client removal"
    assert response["had_data"] == True, "Client1 should have had ephemeral data"
    assert "broadcast_data" in response, "Should include broadcast_data"
    assert response["broadcast_data"]["type"] == "ephemeral-update", "Broadcast should be ephemeral-update"
    assert "event" in response["broadcast_data"], "Should include event data"
    assert response["broadcast_data"]["event"]["removed"] == ["client1"], "Should list client1 as removed"
    
    print("✅ Client disconnect with data working")
    
    # Test disconnecting client that doesn't exist (no data)
    response = model.handle_client_disconnect("client-nonexistent")
    
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["had_data"] == False, "Non-existent client should not have had data"
    assert response["broadcast_needed"] == True, "Should still broadcast for consistency"
    
    print("✅ Client disconnect without data working")
    
    # Verify client2's data still exists
    ephemeral_data_after = model.get_ephemeral_data()
    assert ephemeral_data_after is not None, "Should still have ephemeral data from client2"
    assert len(ephemeral_data_after) > 0, "Should have some ephemeral data remaining"
    
    print("✅ Other client data preserved after disconnect")

def run_all_tests():
    """Run all client disconnect tests"""
    print("🚀 Starting Client Disconnect Tests")
    print("=" * 50)
    
    try:
        test_client_disconnect()
        
        print("=" * 50)
        print("🎉 All Client Disconnect tests PASSED!")
        print("✅ LexicalModel properly handles client disconnections")
        print("✅ Ephemeral data cleanup works correctly")
        print("✅ Broadcast messages are properly structured")
        print("✅ Other clients' data is preserved")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
