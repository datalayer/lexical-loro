# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
Basic tests for the lexical_loro package
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from lexical_loro import LoroWebSocketServer, Client


def test_package_imports():
    """Test that the package can be imported correctly"""
    assert LoroWebSocketServer is not None
    assert Client is not None


def test_server_initialization():
    """Test server initialization"""
    server = LoroWebSocketServer(port=8082)
    assert server.port == 8082
    assert len(server.clients) == 0
    assert len(server.loro_docs) > 0  # Should have default documents
    assert not server.running


def test_client_initialization():
    """Test client initialization"""
    mock_websocket = MagicMock()
    client = Client(mock_websocket, "test_client_123")
    
    assert client.websocket == mock_websocket
    assert client.id == "test_client_123"
    assert client.color.startswith("#")  # Should generate a color
    assert client.cursor_position is None
    assert client.selection is None


def test_server_documents_initialization():
    """Test that server initializes default documents"""
    server = LoroWebSocketServer()
    
    # Check that default documents are created
    expected_docs = [
        'shared-text', 
        'lexical-shared-doc'
    ]
    
    for doc_id in expected_docs:
        assert doc_id in server.loro_docs
        assert doc_id in server.ephemeral_stores
    
    # Verify the documents are properly initialized LoroDoc instances
    assert len(server.loro_docs) == len(expected_docs)
    assert len(server.ephemeral_stores) == len(expected_docs)


def test_client_id_generation():
    """Test client ID generation"""
    server = LoroWebSocketServer()
    
    # Generate multiple client IDs and ensure they're unique
    client_ids = [server.generate_client_id() for _ in range(10)]
    assert len(set(client_ids)) == 10  # All should be unique
    
    # Check format
    for client_id in client_ids:
        assert client_id.startswith("py_client_")
        assert len(client_id.split("_")) == 4  # py_client_timestamp_suffix


@pytest.mark.asyncio
async def test_server_shutdown():
    """Test server shutdown"""
    server = LoroWebSocketServer()
    
    # Mock some clients
    mock_client1 = MagicMock()
    mock_client1.websocket.close = AsyncMock()
    mock_client2 = MagicMock()
    mock_client2.websocket.close = AsyncMock()
    
    server.clients["client1"] = mock_client1
    server.clients["client2"] = mock_client2
    
    # Test shutdown
    await server.shutdown()
    
    # Verify clients were cleaned up
    assert len(server.clients) == 0
    assert len(server.loro_docs) == 0
    assert len(server.ephemeral_stores) == 0
    assert not server.running
