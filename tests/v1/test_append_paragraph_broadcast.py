#!/usr/bin/env python3
"""
Test append-paragraph functionality and broadcasting
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from lexical_loro.model.lexical_model import LexicalModel

def test_append_paragraph_broadcasting():
    """Test that append-paragraph returns proper broadcast data"""
    print("\n🧪 Testing append-paragraph broadcasting...")
    
    model = LexicalModel.create_document("test-append")
    
    # Test append-paragraph command
    append_data = {
        "type": "append-paragraph",
        "docId": "test-append",
        "message": "Test paragraph content"
    }
    
    response = model.handle_message("append-paragraph", append_data, "client-test")
    
    # Verify response structure
    assert response["success"] == True, f"Expected success=True, got {response}"
    assert response["message_type"] == "append-paragraph", f"Expected append-paragraph, got {response['message_type']}"
    assert response["broadcast_needed"] == True, "Should need broadcasting for paragraph addition"
    assert "broadcast_data" in response, "Should include broadcast_data"
    assert response["broadcast_data"]["type"] == "loro-update", "Broadcast should be loro-update type"
    assert "update" in response["broadcast_data"], "Should include update data for broadcasting"
    assert response["added_text"] == "Test paragraph content", "Should include added text"
    
    # Verify response back to sender
    assert response["response_needed"] == True, "Should send response back to sender"
    assert "response_data" in response, "Should include response_data for sender"
    assert response["response_data"]["type"] == "loro-update", "Response should be loro-update type"
    
    # Verify block count increased
    assert response["blocks_after"] > response["blocks_before"], "Block count should increase"
    
    print("✅ Append-paragraph broadcasting working")
    
    # Verify document state
    doc_info = model.get_document_info()
    assert doc_info["lexical_blocks"] > 0, "Should have blocks after adding paragraph"
    
    print("✅ Document state properly updated")

def test_append_paragraph_content():
    """Test that append-paragraph actually adds content to the document"""
    print("\n🧪 Testing append-paragraph content addition...")
    
    model = LexicalModel.create_document("test-content")
    
    # Get initial state
    initial_info = model.get_document_info()
    initial_blocks = initial_info["lexical_blocks"]
    
    # Add a paragraph
    append_data = {
        "type": "append-paragraph", 
        "docId": "test-content",
        "message": "Hello World"
    }
    
    response = model.handle_message("append-paragraph", append_data, "client-test")
    
    # Verify the paragraph was added
    final_info = model.get_document_info()
    final_blocks = final_info["lexical_blocks"]
    
    assert final_blocks > initial_blocks, f"Blocks should increase: {initial_blocks} -> {final_blocks}"
    assert response["blocks_after"] == final_blocks, "Response should match actual final block count"
    
    print(f"✅ Content addition working: {initial_blocks} -> {final_blocks} blocks")

def run_all_tests():
    """Run all append-paragraph tests"""
    print("🚀 Starting Append-Paragraph Broadcast Tests")
    print("=" * 60)
    
    try:
        test_append_paragraph_broadcasting()
        test_append_paragraph_content()
        
        print("=" * 60)
        print("🎉 All Append-Paragraph tests PASSED!")
        print("✅ Append-paragraph generates proper broadcast data")
        print("✅ Broadcast data includes loro-update for other clients")
        print("✅ Response data includes loro-update for sending client")
        print("✅ Document state is properly updated")
        print("✅ Block counts are correctly tracked")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    return True

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
