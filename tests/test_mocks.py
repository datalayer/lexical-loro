#!/usr/bin/env python3

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Mock implementations for testing when loro-py is not available.

These mocks provide basic functionality for testing the collaboration server
without requiring the actual loro-py library to be installed.
"""

from typing import Dict


class MockLoroText:
    """Mock implementation of LoroText for testing"""
    
    def __init__(self, doc: 'MockLoroDoc'):
        self.doc = doc
    
    def insert(self, pos: int, text: str) -> None:
        """Insert text at the specified position"""
        current = self.doc.data
        self.doc.data = current[:pos] + text + current[pos:]
    
    def to_string(self) -> str:
        """Get the current text content"""
        return self.doc.data


class MockLoroDoc:
    """Mock implementation of LoroDoc for testing"""
    
    def __init__(self):
        self.data = ""
        self._texts: Dict[str, MockLoroText] = {}
    
    def get_text(self, key: str) -> MockLoroText:
        """Get or create a text container for the given key"""
        if key not in self._texts:
            self._texts[key] = MockLoroText(self)
        return self._texts[key]
    
    def export_snapshot(self) -> bytes:
        """Export the current state as bytes"""
        return self.data.encode('utf-8')
    
    def import_batch(self, updates: list[bytes]) -> None:
        """Import a batch of updates"""
        for update in updates:
            if isinstance(update, bytes):
                self.data += update.decode('utf-8', errors='ignore')


def get_mock_loro_classes():
    """Return mock classes for testing when loro-py is not available"""
    return MockLoroDoc, MockLoroText


# Test the mock implementations
def test_mock_loro_text():
    """Test MockLoroText functionality"""
    doc = MockLoroDoc()
    text = doc.get_text("test")
    
    # Test insertion
    text.insert(0, "Hello")
    assert text.to_string() == "Hello"
    
    text.insert(5, " World")
    assert text.to_string() == "Hello World"
    
    text.insert(0, "Hi ")
    assert text.to_string() == "Hi Hello World"


def test_mock_loro_doc():
    """Test MockLoroDoc functionality"""
    doc = MockLoroDoc()
    
    # Test text containers
    text1 = doc.get_text("content")
    text2 = doc.get_text("content")
    assert text1 is text2  # Should return same instance
    
    # Test different containers
    text3 = doc.get_text("other")
    assert text1 is not text3
    
    # Test snapshot
    text1.insert(0, "test content")
    snapshot = doc.export_snapshot()
    assert snapshot == b"test content"
    
    # Test import batch
    doc2 = MockLoroDoc()
    doc2.import_batch([b"imported ", b"content"])
    assert doc2.data == "imported content"


if __name__ == "__main__":
    test_mock_loro_text()
    test_mock_loro_doc()
    print("✅ All mock tests passed!")
