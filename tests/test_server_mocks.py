#!/usr/bin/env python3

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test the server with mock implementations
"""

import pytest
import json
import sys
from unittest.mock import patch

# Force the use of mock implementations by patching the import
def force_mock_loro():
    """Force the server to use mock implementations even if loro-py is available"""
    # Import the mock classes
    from tests.test_mocks import get_mock_loro_classes
    MockLoroDoc, MockLoroText = get_mock_loro_classes()
    
    # Patch the server module to use mocks
    import lexical_loro.serverv2
    lexical_loro.serverv2.LoroDoc = MockLoroDoc
    lexical_loro.serverv2.LoroText = MockLoroText
    
    return MockLoroDoc, MockLoroText


def test_server_with_mocks():
    """Test that the server works with mock implementations"""
    # Force mock usage
    MockLoroDoc, MockLoroText = force_mock_loro()
    
    # Import after forcing mocks
    from lexical_loro.serverv2 import LoroDocumentV2
    
    # Create a document (this should use mock implementations)
    doc = LoroDocumentV2("test-doc", '{"root":{"children":[],"type":"root"}}')
    
    # Test basic operations
    assert doc.doc_id == "test-doc"
    assert len(doc.clients) == 0
    
    # Test adding/removing clients
    doc.add_client("client1")
    assert len(doc.clients) == 1
    assert "client1" in doc.clients
    
    doc.add_client("client2")
    assert len(doc.clients) == 2
    
    is_empty = doc.remove_client("client1")
    assert not is_empty
    assert len(doc.clients) == 1
    assert "client1" not in doc.clients
    
    is_empty = doc.remove_client("client2")
    assert is_empty
    assert len(doc.clients) == 0
    
    # Test snapshot
    snapshot = doc.get_snapshot()
    assert isinstance(snapshot, bytes)
    
    # Test update application with compatible mock data
    test_update = b"test update"
    success = doc.apply_update(test_update)
    assert success  # Should succeed with mock implementation


def test_mock_document_initialization():
    """Test document initialization with mock implementations"""
    # Force mock usage
    force_mock_loro()
    
    # Import after forcing mocks
    from lexical_loro.serverv2 import LoroDocumentV2
    
    initial_content = '{"root":{"children":[{"text":"Hello","type":"text"}],"type":"root"}}'
    doc = LoroDocumentV2("init-test", initial_content)
    
    assert doc.doc_id == "init-test"
    
    # Test snapshot after initialization
    snapshot = doc.get_snapshot()
    assert isinstance(snapshot, bytes)
    assert len(snapshot) > 0


def test_mock_implementations_directly():
    """Test the mock implementations directly"""
    from tests.test_mocks import MockLoroDoc, MockLoroText
    
    # Test MockLoroDoc
    doc = MockLoroDoc()
    text = doc.get_text("test")
    assert isinstance(text, MockLoroText)
    
    # Test text operations
    text.insert(0, "Hello")
    assert text.to_string() == "Hello"
    
    # Test snapshot
    snapshot = doc.export_snapshot()
    assert snapshot == b"Hello"
    
    # Test import batch
    doc.import_batch([b" World"])
    assert doc.data == "Hello World"


if __name__ == "__main__":
    test_mock_implementations_directly()
    test_server_with_mocks()
    test_mock_document_initialization()
    print("✅ All server mock integration tests passed!")
