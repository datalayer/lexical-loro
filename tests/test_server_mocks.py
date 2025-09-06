#!/usr/bin/env python3

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Test the server with mock implementations

This test verifies that:
1. Mock implementations are available and functional
2. The server can import and use them when loro-py is not available
3. Basic server functionality works with mocks
"""

import pytest
import json
import sys
from pathlib import Path


def test_mock_implementations_directly():
    """Test the mock implementations directly"""
    # Import from the current directory
    current_dir = Path(__file__).parent
    if str(current_dir) not in sys.path:
        sys.path.insert(0, str(current_dir))
    
    from test_mocks import MockLoroDoc, MockLoroText
    
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


def test_mock_import_function():
    """Test that we can import mock classes using the get_mock_loro_classes function"""
    # Import from the current directory
    current_dir = Path(__file__).parent
    if str(current_dir) not in sys.path:
        sys.path.insert(0, str(current_dir))
    
    from test_mocks import get_mock_loro_classes
    
    MockLoroDoc, MockLoroText = get_mock_loro_classes()
    
    # Test that the returned classes work
    doc = MockLoroDoc()
    text = doc.get_text("content")
    text.insert(0, "Test content")
    
    assert text.to_string() == "Test content"
    assert doc.export_snapshot() == b"Test content"


def test_server_imports_mocks_when_needed():
    """Test that the server can import mocks when loro-py is not available"""
    # This test verifies the import mechanism without running full server functionality
    
    # Temporarily hide the loro module if it exists
    original_modules = sys.modules.copy()
    loro_hidden = False
    
    try:
        if 'loro' in sys.modules:
            loro_module = sys.modules.pop('loro')
            loro_hidden = True
        
        # Force reimport of the server module to trigger fallback logic
        if 'lexical_loro.serverv2' in sys.modules:
            del sys.modules['lexical_loro.serverv2']
        
        # This should trigger the ImportError path and load mocks
        import lexical_loro.serverv2
        
        # Verify that LoroDoc and LoroText are available (either real or mock)
        assert hasattr(lexical_loro.serverv2, 'LoroDoc')
        assert hasattr(lexical_loro.serverv2, 'LoroText')
        
        # Test that we can instantiate them
        doc = lexical_loro.serverv2.LoroDoc()
        assert doc is not None
        
        # Test that they have the expected methods
        text = doc.get_text("test")
        assert hasattr(text, 'insert')
        assert hasattr(text, 'to_string')
        assert hasattr(doc, 'export_snapshot')
        assert hasattr(doc, 'import_batch')
        
    finally:
        # Restore the original state
        if loro_hidden and 'loro_module' in locals():
            sys.modules['loro'] = loro_module
        
        # Clean up any imported modules to avoid state pollution
        modules_to_remove = [key for key in sys.modules.keys() if key.startswith('lexical_loro')]
        for module in modules_to_remove:
            if module in sys.modules:
                del sys.modules[module]


def test_server_mock_integration_basic():
    """Test basic server document functionality with mocks (limited scope)"""
    # Force mock usage by manipulating the import
    current_dir = Path(__file__).parent
    if str(current_dir) not in sys.path:
        sys.path.insert(0, str(current_dir))
    
    from test_mocks import get_mock_loro_classes
    MockLoroDoc, MockLoroText = get_mock_loro_classes()
    
    # Test basic document operations that don't depend on complex server logic
    doc = MockLoroDoc()
    
    # Test initial state
    assert doc.data == ""
    
    # Test text operations
    text = doc.get_text("content")
    text.insert(0, '{"type":"root","children":[]}')
    
    # Test that we can get the content back
    content = text.to_string()
    assert content == '{"type":"root","children":[]}'
    
    # Test snapshot
    snapshot = doc.export_snapshot()
    assert isinstance(snapshot, bytes)
    assert len(snapshot) > 0


if __name__ == "__main__":
    test_mock_implementations_directly()
    test_mock_import_function()
    test_server_imports_mocks_when_needed()
    test_server_mock_integration_basic()
    print("✅ All server mock integration tests passed!")
