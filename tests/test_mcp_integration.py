# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import pytest
import asyncio
import json
from unittest.mock import AsyncMock, patch

from lexical_loro.mcp.server import LexicalMCPServer, main
from mcp.types import Tool


class TestMCPIntegration:
    """Integration tests for the MCP server"""

    @pytest.mark.asyncio
    async def test_main_function_exists(self):
        """Test that the main function is properly defined"""
        # Import the main function to ensure it's accessible
        from lexical_loro.mcp import main as mcp_main
        
        # Verify it's callable
        assert callable(mcp_main)

    @pytest.mark.asyncio 
    async def test_server_tool_registration(self):
        """Test that all tools are properly registered"""
        server = LexicalMCPServer()
        
        # Check that the server has the expected methods
        assert hasattr(server.server, 'list_tools')
        assert hasattr(server.server, 'call_tool')
        
        # Test that our tool methods exist
        assert hasattr(server, '_load_document')
        assert hasattr(server, '_append_paragraph')
        assert hasattr(server, '_insert_paragraph')

    @pytest.mark.asyncio
    async def test_document_persistence_across_operations(self):
        """Test that document state persists across multiple operations"""
        server = LexicalMCPServer()
        doc_id = "persistent-test-doc"
        
        # Perform multiple operations
        await server._append_paragraph({"doc_id": doc_id, "text": "First"})
        await server._append_paragraph({"doc_id": doc_id, "text": "Second"})
        await server._insert_paragraph({"doc_id": doc_id, "index": 1, "text": "Middle"})
        
        # Load document and verify state
        result = await server._load_document({"doc_id": doc_id})
        data = json.loads(result[0].text)
        
        children = data["lexical_data"]["root"]["children"]
        texts = [child["children"][0]["text"] for child in children]
        
        assert texts == ["First", "Middle", "Second"]

    @pytest.mark.asyncio
    async def test_tool_schema_validation(self):
        """Test that tool schemas are properly defined"""
        server = LexicalMCPServer()
        
        # Test that the tools work correctly (indirectly testing schemas)
        # This verifies that the tool registration worked with proper schemas
        
        # Test load_document
        result = await server._load_document({"doc_id": "schema-test"})
        data = json.loads(result[0].text)
        assert data["success"] is True
        
        # Test append_paragraph
        result = await server._append_paragraph({"doc_id": "schema-test", "text": "test"})
        data = json.loads(result[0].text)
        assert data["success"] is True
        
        # Test insert_paragraph
        result = await server._insert_paragraph({"doc_id": "schema-test", "index": 0, "text": "test"})
        data = json.loads(result[0].text)
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_concurrent_document_access(self):
        """Test concurrent access to the same document"""
        server = LexicalMCPServer()
        doc_id = "concurrent-test-doc"
        
        # Create multiple concurrent operations
        tasks = []
        for i in range(5):
            tasks.append(server._append_paragraph({
                "doc_id": doc_id,
                "text": f"Paragraph {i}"
            }))
        
        # Wait for all operations to complete
        results = await asyncio.gather(*tasks)
        
        # Verify all operations succeeded
        for result in results:
            data = json.loads(result[0].text)
            assert data["success"] is True
        
        # Load final state
        load_result = await server._load_document({"doc_id": doc_id})
        load_data = json.loads(load_result[0].text)
        
        # Should have 5 paragraphs
        children = load_data["lexical_data"]["root"]["children"]
        assert len(children) == 5

    @pytest.mark.asyncio
    async def test_large_document_handling(self):
        """Test handling of models with many paragraphs"""
        server = LexicalMCPServer()
        doc_id = "large-test-doc"
        
        # Add many paragraphs
        num_paragraphs = 50
        for i in range(num_paragraphs):
            await server._append_paragraph({
                "doc_id": doc_id,
                "text": f"This is paragraph number {i + 1} with some content."
            })
        
        # Load the document
        result = await server._load_document({"doc_id": doc_id})
        data = json.loads(result[0].text)
        
        # Verify all paragraphs were added
        children = data["lexical_data"]["root"]["children"]
        assert len(children) == num_paragraphs
        
        # Verify content integrity
        for i, child in enumerate(children):
            expected_text = f"This is paragraph number {i + 1} with some content."
            actual_text = child["children"][0]["text"]
            assert actual_text == expected_text

    @pytest.mark.asyncio
    async def test_document_manager_collaboration(self):
        """Test that different server instances share collaborative document state"""
        server1 = LexicalMCPServer()
        server2 = LexicalMCPServer()
        
        doc_id = "collaboration-test-doc"
        
        # Add content to server1
        await server1._append_paragraph({"doc_id": doc_id, "text": "Server 1 content"})
        
        # Add content to server2
        await server2._append_paragraph({"doc_id": doc_id, "text": "Server 2 content"})
        
        # Load from both servers
        result1 = await server1._load_document({"doc_id": doc_id})
        result2 = await server2._load_document({"doc_id": doc_id})
        
        data1 = json.loads(result1[0].text)
        data2 = json.loads(result2[0].text)
        
        # Both servers should see the same collaborative content
        children1 = data1["lexical_data"]["root"]["children"]
        children2 = data2["lexical_data"]["root"]["children"]
        
        assert len(children1) == 2  # Both paragraphs from both servers
        assert len(children2) == 2  # Same content on both servers
        
        # Verify both pieces of content are present
        texts = [children1[0]["children"][0]["text"], children1[1]["children"][0]["text"]]
        assert "Server 1 content" in texts
        assert "Server 2 content" in texts
