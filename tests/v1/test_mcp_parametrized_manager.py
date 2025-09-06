#!/usr/bin/env python3
"""Test the parametrized document manager functionality"""

import asyncio
import json
from lexical_loro.mcp.server import LexicalMCPServer, set_document_manager, get_document_manager
from lexical_loro.model.lexical_model import LexicalDocumentManager


class CustomDocumentManager(LexicalDocumentManager):
    """Custom document manager for testing"""
    
    def __init__(self):
        super().__init__()
        self.custom_prefix = "CUSTOM_"
        self.access_log = []
    
    def get_or_create_document(self, doc_id: str):
        """Override to add custom behavior"""
        self.access_log.append(f"Access: {doc_id}")
        # Add custom prefix to document IDs
        prefixed_id = f"{self.custom_prefix}{doc_id}"
        return super().get_or_create_document(prefixed_id)


async def test_custom_document_manager():
    """Test using a custom document manager"""
    print("Testing Custom Document Manager...")
    
    # Create custom manager
    custom_manager = CustomDocumentManager()
    
    # Test global function
    print("1. Testing global set_document_manager function...")
    set_document_manager(custom_manager)
    current_manager = get_document_manager()
    print(f"✅ Manager type: {type(current_manager).__name__}")
    print(f"✅ Has custom prefix: {hasattr(current_manager, 'custom_prefix')}")
    
    # Test with server class
    print("2. Testing LexicalMCPServer with custom manager...")
    server = LexicalMCPServer(custom_document_manager=custom_manager)
    print(f"✅ Server manager type: {type(server.document_manager).__name__}")
    
    # Test operations with custom manager
    print("3. Testing operations with custom manager...")
    result = await server._set_current_document({"doc_id": "test-doc"})
    data = json.loads(result[0].text)
    print(f"✅ Set current document: {data['success']}")
    print(f"✅ Container ID: {data['container_id']}")
    
    # Check access log
    print(f"✅ Access log: {custom_manager.access_log}")
    
    # Test that the document ID was prefixed
    result = await server._append_paragraph({"text": "Test paragraph"})
    data = json.loads(result[0].text)
    print(f"✅ Append successful: {data['success']}")
    print(f"✅ Document ID used: {data['doc_id']}")
    
    # Verify the custom prefix was applied
    if data['doc_id'].startswith("CUSTOM_"):
        print("✅ Custom prefix applied correctly")
    else:
        print("❌ Custom prefix not applied")


async def test_default_manager():
    """Test using default document manager"""
    print("\nTesting Default Document Manager...")
    
    # Create server with default manager
    server = LexicalMCPServer()
    print(f"✅ Default manager type: {type(server.document_manager).__name__}")
    
    # Test operations
    result = await server._set_current_document({"doc_id": "default-test"})
    data = json.loads(result[0].text)
    print(f"✅ Default manager works: {data['success']}")


async def test_invalid_manager():
    """Test error handling with invalid manager"""
    print("\nTesting Invalid Manager Error Handling...")
    
    try:
        set_document_manager("not a manager")
        print("❌ Should have raised TypeError")
    except TypeError as e:
        print(f"✅ Correctly raised TypeError: {e}")


if __name__ == "__main__":
    asyncio.run(test_custom_document_manager())
    asyncio.run(test_default_manager())
    asyncio.run(test_invalid_manager())
