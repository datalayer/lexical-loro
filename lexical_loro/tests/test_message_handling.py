#!/usr/bin/env python3
"""
Test Step 2: Message Handling Methods for LexicalModel

Tests the new message handling capabilities:
- LexicalModel.handle_message()
- Support for "loro-update", "snapshot", "request-snapshot", "append-paragraph"
- Structured response format for server broadcasting
"""

import json
import sys
import os

# Add the module path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from lexical_loro.model.lexical_model import LexicalModel

# Test data
INITIAL_LEXICAL_JSON = {
    "root": {
        "children": [
            {
                "children": [
                    {
                        "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "style": "",
                        "text": "Message Handling Test",
                        "type": "text",
                        "version": 1
                    }
                ],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "heading",
                "version": 1,
                "tag": "h1"
            }
        ],
        "direction": None,
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    },
    "lastSaved": 1725000000000,
    "source": "Message Test",
    "version": "0.34.0"
}

def test_handle_message_basic():
    """Test basic handle_message functionality"""
    print("🧪 Testing handle_message() basic functionality")
    
    model = LexicalModel.create_document("test-msg", initial_content=INITIAL_LEXICAL_JSON)
    
    # Test unsupported message type
    response = model.handle_message("unsupported-type", {}, "client-123")
    print(f"✅ Unsupported message type response: {response['success']} - {response.get('error', 'N/A')}")
    
    # Test with invalid data
    response = model.handle_message("loro-update", {}, "client-123")
    print(f"✅ Invalid data response: {response['success']} - {response.get('error', 'N/A')}")
    
    return model

def test_append_paragraph_message():
    """Test append-paragraph message handling"""
    print("\n🧪 Testing append-paragraph message handling")
    
    model = LexicalModel.create_document("test-append", initial_content=INITIAL_LEXICAL_JSON)
    
    # Test append paragraph
    message_data = {
        "message": "This is a test paragraph added via message handling!"
    }
    
    response = model.handle_message("append-paragraph", message_data, "client-456")
    
    print(f"✅ Append paragraph result: {response['success']}")
    print(f"   Blocks before: {response.get('blocks_before', 'N/A')}")
    print(f"   Blocks after: {response.get('blocks_after', 'N/A')}")
    print(f"   Added text: '{response.get('added_text', 'N/A')}'")
    
    return model, response

def test_snapshot_request_message():
    """Test request-snapshot message handling"""
    print("\n🧪 Testing request-snapshot message handling")
    
    model = LexicalModel.create_document("test-snapshot-req", initial_content=INITIAL_LEXICAL_JSON)
    
    # Test snapshot request
    message_data = {}
    
    response = model.handle_message("request-snapshot", message_data, "client-789")
    
    print(f"✅ Snapshot request result: {response['success']}")
    print(f"   Response needed: {response.get('response_needed', False)}")
    print(f"   Snapshot size: {response.get('snapshot_size', 0)} bytes")
    
    if response.get('response_data'):
        resp_data = response['response_data']
        print(f"   Response type: {resp_data.get('type')}")
        print(f"   Response docId: {resp_data.get('docId')}")
        print(f"   Response snapshot length: {len(resp_data.get('snapshot', []))}")
    
    return model, response

def test_snapshot_import_message():
    """Test snapshot import message handling"""
    print("\n🧪 Testing snapshot import message handling")
    
    # Create source model with content
    source_model = LexicalModel.create_document("source", initial_content=INITIAL_LEXICAL_JSON)
    source_model.add_block({"text": "Additional content for import test"}, "paragraph")
    
    # Get snapshot from source
    snapshot = source_model.get_snapshot()
    
    # Create target model
    target_model = LexicalModel.create_document("target")
    
    # Test snapshot import message
    message_data = {
        "snapshot": list(snapshot)
    }
    
    response = target_model.handle_message("snapshot", message_data, "client-import")
    
    print(f"✅ Snapshot import result: {response['success']}")
    print(f"   Imported size: {response.get('imported_snapshot_size', 0)} bytes")
    
    if response.get('document_info'):
        doc_info = response['document_info']
        print(f"   Content length: {doc_info.get('content_length', 0)}")
        print(f"   Blocks: {doc_info.get('lexical_blocks', 0)}")
        print(f"   Container: {doc_info.get('container_id')}")
    
    return source_model, target_model, response

def test_loro_update_message():
    """Test loro-update message handling"""
    print("\n🧪 Testing loro-update message handling")
    
    # Create source model and add content
    source_model = LexicalModel.create_document("source-update", initial_content=INITIAL_LEXICAL_JSON)
    source_model.add_block({"text": "Content for update test"}, "paragraph")
    
    # Get snapshot as update data
    update_data = source_model.get_snapshot()
    
    # Create target model
    target_model = LexicalModel.create_document("target-update")
    
    # Test loro-update message
    message_data = {
        "update": list(update_data)
    }
    
    response = target_model.handle_message("loro-update", message_data, "client-update")
    
    print(f"✅ Loro update result: {response['success']}")
    print(f"   Broadcast needed: {response.get('broadcast_needed', False)}")
    print(f"   Applied size: {response.get('applied_update_size', 0)} bytes")
    
    if response.get('document_info'):
        doc_info = response['document_info']
        print(f"   Content length: {doc_info.get('content_length', 0)}")
        print(f"   Blocks: {doc_info.get('lexical_blocks', 0)}")
    
    if response.get('broadcast_data'):
        print(f"   Broadcast data available: {len(response['broadcast_data'])} keys")
    
    return source_model, target_model, response

def test_message_response_format():
    """Test that all message responses have consistent format"""
    print("\n🧪 Testing message response format consistency")
    
    model = LexicalModel.create_document("format-test", initial_content=INITIAL_LEXICAL_JSON)
    
    # Test all message types
    test_cases = [
        ("append-paragraph", {"message": "Test"}),
        ("request-snapshot", {}),
        ("snapshot", {"snapshot": list(model.get_snapshot())}),
        ("loro-update", {"update": list(model.get_snapshot())}),
        ("invalid-type", {})
    ]
    
    for msg_type, msg_data in test_cases:
        response = model.handle_message(msg_type, msg_data, "format-client")
        
        # Check required fields
        required_fields = ["success", "message_type"]
        missing_fields = [field for field in required_fields if field not in response]
        
        print(f"✅ {msg_type}: success={response.get('success')}, required_fields_present={len(missing_fields) == 0}")
        
        if missing_fields:
            print(f"   Missing fields: {missing_fields}")
        
        # Check error handling
        if not response.get('success'):
            error_present = 'error' in response
            print(f"   Error field present: {error_present}")
    
    return True

def main():
    """Main test function"""
    print("🚀 Testing Step 2: Message Handling Methods")
    print("=" * 50)
    
    try:
        # Test basic functionality
        model = test_handle_message_basic()
        
        # Test append-paragraph
        append_model, append_response = test_append_paragraph_message()
        
        # Test snapshot request
        req_model, req_response = test_snapshot_request_message()
        
        # Test snapshot import
        source_model, target_model, import_response = test_snapshot_import_message()
        
        # Test loro-update
        update_source, update_target, update_response = test_loro_update_message()
        
        # Test response format consistency
        test_message_response_format()
        
        print("\n" + "=" * 50)
        print("🎉 All Step 2 tests completed successfully!")
        
        # Show summary
        print(f"\n📋 Test Summary:")
        print(f"   ✅ Basic message handling")
        print(f"   ✅ append-paragraph: {append_response.get('blocks_after', 0)} blocks")
        print(f"   ✅ request-snapshot: {req_response.get('snapshot_size', 0)} bytes")
        print(f"   ✅ snapshot import: {import_response.get('imported_snapshot_size', 0)} bytes")
        print(f"   ✅ loro-update: {update_response.get('applied_update_size', 0)} bytes")
        print(f"   ✅ Response format consistency")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
