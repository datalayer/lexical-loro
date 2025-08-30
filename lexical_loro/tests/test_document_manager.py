#!/usr/bin/env python3
"""
Test Step 6: LexicalDocumentManager Implementation
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from lexical_loro.model.lexical_model import LexicalDocumentManager

def test_document_manager():
    """Test basic LexicalDocumentManager functionality"""
    print("🧪 Testing LexicalDocumentManager...")
    
    # Create document manager
    def event_handler(event_type, event_data):
        print(f"📡 Event: {event_type} - {event_data}")
    
    manager = LexicalDocumentManager(event_callback=event_handler)
    print(f"✅ Created manager: {repr(manager)}")
    
    # Test document creation
    doc1 = manager.get_or_create_document("test-doc-1", '{"test": "content"}')
    print(f"✅ Created document 1: {type(doc1).__name__}")
    
    doc2 = manager.get_or_create_document("test-doc-2")
    print(f"✅ Created document 2: {type(doc2).__name__}")
    
    # Test getting same document
    doc1_again = manager.get_or_create_document("test-doc-1")
    print(f"✅ Same document check: {doc1 is doc1_again}")
    
    # Test listing documents
    docs = manager.list_documents()
    print(f"✅ Documents: {docs}")
    
    # Test document info
    info = manager.get_document_info("test-doc-1")
    print(f"✅ Document info: {info}")
    
    # Test message handling
    response = manager.handle_message("test-doc-1", "request-snapshot", {}, "test-client")
    print(f"✅ Message response: {response.get('success', False)}")
    
    # Test ephemeral message handling
    ephemeral_response = manager.handle_ephemeral_message("test-doc-1", "cursor-position", {"x": 10, "y": 20}, "test-client")
    print(f"✅ Ephemeral response: {ephemeral_response.get('success', False)}")
    
    # Test cleanup
    removed = manager.cleanup_document("test-doc-1")
    print(f"✅ Document cleanup: {removed}")
    
    print(f"✅ Final manager state: {repr(manager)}")
    
    # Cleanup all
    manager.cleanup()
    print("✅ All tests completed!")

if __name__ == "__main__":
    test_document_manager()
