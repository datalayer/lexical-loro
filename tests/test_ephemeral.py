#!/usr/bin/env python3
"""
Test Step 3: EphemeralStore integration into LexicalModel
"""

import sys
import os
import json
import time

# Add the parent directory to the path so we can import the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from model.lexical_model import LexicalModel

def test_ephemeral_timeout_parameter():
    """Test that LexicalModel accepts ephemeral_timeout parameter"""
    print("🧪 Testing ephemeral_timeout parameter...")
    
    # Test default timeout
    model1 = LexicalModel(container_id="test-doc-1")
    assert model1.ephemeral_timeout == 300000, f"Expected default timeout 300000, got {model1.ephemeral_timeout}"
    assert model1.ephemeral_store is not None, "EphemeralStore should be created"
    print("✅ Default ephemeral_timeout working")
    
    # Test custom timeout
    custom_timeout = 600000  # 10 minutes
    model2 = LexicalModel(container_id="test-doc-2", ephemeral_timeout=custom_timeout)
    assert model2.ephemeral_timeout == custom_timeout, f"Expected custom timeout {custom_timeout}, got {model2.ephemeral_timeout}"
    assert model2.ephemeral_store is not None, "EphemeralStore should be created"
    print("✅ Custom ephemeral_timeout working")
    
    # Test create_document method with ephemeral_timeout
    model3 = LexicalModel.create_document("test-doc-3", ephemeral_timeout=custom_timeout)
    assert model3.ephemeral_timeout == custom_timeout, f"Expected custom timeout {custom_timeout}, got {model3.ephemeral_timeout}"
    assert model3.ephemeral_store is not None, "EphemeralStore should be created"
    print("✅ create_document with ephemeral_timeout working")

def test_handle_ephemeral_message():
    """Test that LexicalModel can handle ephemeral messages"""
    print("\n🧪 Testing handle_ephemeral_message method...")
    
    model = LexicalModel.create_document("test-ephemeral")
    
    # Test cursor position message
    cursor_data = {
        "type": "cursor-position",
        "docId": "test-ephemeral", 
        "position": {"line": 1, "column": 5},
        "color": "#ff0000"
    }
    
    response = model.handle_ephemeral_message("cursor-position", cursor_data, "client-123")
    
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["message_type"] == "cursor-position", f"Expected cursor-position, got {response['message_type']}"
    assert response["broadcast_needed"] == True, "Cursor position should need broadcasting"
    assert "broadcast_data" in response, "Should include broadcast_data"
    assert response["client_id"] == "client-123", f"Expected client-123, got {response['client_id']}"
    print("✅ Cursor position message handling working")
    
    # Test text selection message
    selection_data = {
        "type": "text-selection",
        "docId": "test-ephemeral",
        "selection": {"start": 0, "end": 10},
        "color": "#00ff00"
    }
    
    response = model.handle_ephemeral_message("text-selection", selection_data, "client-456")
    
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["message_type"] == "text-selection", f"Expected text-selection, got {response['message_type']}"
    assert response["broadcast_needed"] == True, "Text selection should need broadcasting"
    assert "broadcast_data" in response, "Should include broadcast_data"
    assert response["client_id"] == "client-456", f"Expected client-456, got {response['client_id']}"
    print("✅ Text selection message handling working")

def test_awareness_update():
    """Test awareness update message handling"""
    print("\n🧪 Testing awareness update message handling...")
    
    model = LexicalModel.create_document("test-awareness")
    
    awareness_data = {
        "type": "awareness-update",
        "docId": "test-awareness",
        "awarenessState": {"name": "John", "cursor": {"line": 2, "column": 3}},
        "peerId": "peer-789"
    }
    
    response = model.handle_ephemeral_message("awareness-update", awareness_data, "client-789")
    
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["message_type"] == "awareness-update", f"Expected awareness-update, got {response['message_type']}"
    assert response["broadcast_needed"] == True, "Awareness update should need broadcasting"
    assert "broadcast_data" in response, "Should include broadcast_data"
    assert response["peer_id"] == "peer-789", f"Expected peer-789, got {response['peer_id']}"
    print("✅ Awareness update message handling working")

def test_ephemeral_update():
    """Test ephemeral-update message handling"""
    print("\n🧪 Testing ephemeral-update message handling...")
    
    model = LexicalModel.create_document("test-ephemeral-update")
    
    # First, get some actual ephemeral data by setting cursor position
    cursor_data = {
        "type": "cursor-position",
        "docId": "test-ephemeral-update",
        "position": {"line": 1, "column": 5}
    }
    model.handle_ephemeral_message("cursor-position", cursor_data, "client-source")
    
    # Get the actual ephemeral data
    actual_ephemeral_bytes = model.get_ephemeral_data()
    if actual_ephemeral_bytes:
        ephemeral_hex = actual_ephemeral_bytes.hex()
        
        # Now test with real ephemeral data
        ephemeral_data = {
            "type": "ephemeral-update",
            "docId": "test-ephemeral-update",
            "data": ephemeral_hex
        }
        
        response = model.handle_ephemeral_message("ephemeral-update", ephemeral_data, "client-999")
        
        assert response["success"] == True, f"Expected success=True, got {response}"
        assert response["message_type"] == "ephemeral-update", f"Expected ephemeral-update, got {response['message_type']}"
        assert response["broadcast_needed"] == True, "Ephemeral updates should be broadcasted for collaboration"
        assert response["client_id"] == "client-999", f"Expected client-999, got {response['client_id']}"
        assert "broadcast_data" in response, "Should include broadcast_data for sharing ephemeral updates"
        assert response["broadcast_data"]["type"] == "ephemeral-update", "Broadcast should be ephemeral-update type"
        print("✅ Ephemeral update message handling working")
    else:
        print("⚠️  Skipping ephemeral-update test - no ephemeral data available")

def test_ephemeral_direct():
    """Test direct ephemeral message handling"""
    print("\n🧪 Testing direct ephemeral message handling...")
    
    model = LexicalModel.create_document("test-ephemeral-direct")
    
    # First, get some actual ephemeral data by setting cursor position
    cursor_data = {
        "type": "cursor-position",
        "docId": "test-ephemeral-direct",
        "position": {"line": 1, "column": 5}
    }
    model.handle_ephemeral_message("cursor-position", cursor_data, "client-source")
    
    # Get the actual ephemeral data
    actual_ephemeral_bytes = model.get_ephemeral_data()
    if actual_ephemeral_bytes:
        # Test with array format
        ephemeral_data_array = {
            "type": "ephemeral",
            "docId": "test-ephemeral-direct",
            "data": list(actual_ephemeral_bytes)  # Convert bytes to array
        }
        
        response = model.handle_ephemeral_message("ephemeral", ephemeral_data_array, "client-array")
        
        assert response["success"] == True, f"Expected success=True, got {response}"
        assert response["message_type"] == "ephemeral", f"Expected ephemeral, got {response['message_type']}"
        assert response["broadcast_needed"] == True, "Ephemeral data should be broadcasted for collaboration"
        assert "broadcast_data" in response, "Should include broadcast_data for sharing ephemeral updates"
        print("✅ Direct ephemeral message (array format) working")
        
        # Test with hex format
        ephemeral_data_hex = {
            "type": "ephemeral",
            "docId": "test-ephemeral-direct",
            "data": actual_ephemeral_bytes.hex()  # Use actual ephemeral data
        }
        
        response = model.handle_ephemeral_message("ephemeral", ephemeral_data_hex, "client-hex")
        
        assert response["success"] == True, f"Expected success=True, got {response}"
        assert response["message_type"] == "ephemeral", f"Expected ephemeral, got {response['message_type']}"
        assert response["broadcast_needed"] == True, "Ephemeral data should be broadcasted for collaboration"
        assert "broadcast_data" in response, "Should include broadcast_data for sharing ephemeral updates"
        print("✅ Direct ephemeral message (hex format) working")
    else:
        print("⚠️  Skipping ephemeral direct test - no ephemeral data available")

def test_get_ephemeral_data():
    """Test getting ephemeral data for broadcasting"""
    print("\n🧪 Testing get_ephemeral_data method...")
    
    model = LexicalModel.create_document("test-get-ephemeral")
    
    # Add some cursor data
    cursor_data = {
        "type": "cursor-position",
        "docId": "test-get-ephemeral",
        "position": {"line": 1, "column": 5}
    }
    model.handle_ephemeral_message("cursor-position", cursor_data, "client-test")
    
    # Get ephemeral data
    ephemeral_bytes = model.get_ephemeral_data()
    
    assert ephemeral_bytes is not None, "Should return ephemeral data bytes"
    assert isinstance(ephemeral_bytes, bytes), f"Expected bytes, got {type(ephemeral_bytes)}"
    print("✅ get_ephemeral_data working")

def test_error_handling():
    """Test error handling in ephemeral messages"""
    print("\n🧪 Testing error handling...")
    
    model = LexicalModel.create_document("test-errors")
    
    # Test unknown message type
    response = model.handle_ephemeral_message("unknown-type", {}, "client-error")
    assert response["success"] == False, "Should fail for unknown message type"
    assert "Unknown ephemeral message type" in response["error"], f"Expected error message, got {response['error']}"
    print("✅ Unknown message type error handling working")
    
    # Test missing data
    response = model.handle_ephemeral_message("cursor-position", {}, "client-error")
    assert response["success"] == False, "Should fail for missing position data"
    assert "No cursor position provided" in response["error"], f"Expected error message, got {response['error']}"
    print("✅ Missing data error handling working")

def run_all_tests():
    """Run all Step 3 tests"""
    print("🚀 Starting Step 3: EphemeralStore Integration Tests")
    print("=" * 60)
    
    try:
        test_ephemeral_timeout_parameter()
        test_handle_ephemeral_message()
        test_awareness_update()
        test_ephemeral_update()
        test_ephemeral_direct()
        test_get_ephemeral_data()
        test_error_handling()
        
        print("\n" + "=" * 60)
        print("🎉 All Step 3 tests PASSED!")
        print("✅ LexicalModel now has integrated EphemeralStore management")
        print("✅ handle_ephemeral_message() supports all required message types")
        print("✅ Ephemeral data broadcasting is properly structured")
        print("✅ Error handling works correctly")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
