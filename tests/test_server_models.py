#!/usr/bin/env python3
"""Test script to verify LoroModel integration in the server"""

from lexical_loro.server import LoroWebSocketServer
from loro import LoroDoc


def test_server_model_integration():
    """Test that the server properly maintains LoroModel instances"""
    
    # Create a server instance
    server = LoroWebSocketServer(port=8082)
    
    print("🧪 Testing LoroModel integration in server...")
    
    # Check that models were created for lexical documents during initialization
    print(f"📊 Initial state:")
    print(f"  - Documents: {list(server.loro_docs.keys())}")
    print(f"  - Models: {list(server.loro_models.keys())}")
    
    # Verify that lexical-shared-doc has a corresponding model
    assert 'lexical-shared-doc' in server.loro_docs, "lexical-shared-doc should exist in loro_docs"
    assert 'lexical-shared-doc' in server.loro_models, "lexical-shared-doc should have a corresponding LoroModel"
    
    # Test the get_loro_model utility method
    model = server.get_loro_model('lexical-shared-doc')
    assert model is not None, "Should get a valid LoroModel"
    assert server.loro_models['lexical-shared-doc'] is model, "Should return the same model instance"
    
    # Test creating a new model for a non-existent document
    new_model = server.get_loro_model('new-lexical-doc')
    assert 'new-lexical-doc' in server.loro_docs, "Should create new document"
    assert 'new-lexical-doc' in server.loro_models, "Should create new model"
    assert new_model is not None, "Should get a valid LoroModel for new document"
    
    # Test that the model is properly connected to the document
    model = server.loro_models['lexical-shared-doc']
    doc = server.loro_docs['lexical-shared-doc']
    
    # The model should have access to the document
    assert model.get_text_document() is doc, "Model should reference the same document"
    
    print("✅ All LoroModel integration tests passed!")
    
    # Test some model functionality
    print("\n🧪 Testing LoroModel functionality...")
    
    # Add a block using the model
    model.add_block({"text": "Test block from server"}, "paragraph")
    
    # Verify the block was added
    blocks = model.get_blocks()
    print(f"📋 Blocks after adding: {len(blocks)}")
    assert len(blocks) > 0, "Should have at least one block"
    
    # Check that the document was updated
    lexical_data = model.get_lexical_data()
    assert "root" in lexical_data, "Should have root structure"
    assert "children" in lexical_data["root"], "Should have children array"
    
    print("✅ LoroModel functionality tests passed!")
    
    return True


if __name__ == "__main__":
    try:
        test_server_model_integration()
        print("\n🎉 All tests completed successfully!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
