#!/usr/bin/env python3
"""Tests for the current document functionality"""

import pytest
import json
from mcp.types import TextContent
from lexical_loro.mcp.server import LexicalMCPServer


class TestCurrentDocumentFunctionality:
    """Test suite for current document functionality"""

    @pytest.fixture
    def server(self):
        """Create a server instance for testing"""
        return LexicalMCPServer()

    @pytest.mark.asyncio
    async def test_set_current_document(self, server):
        """Test setting the current document"""
        doc_id = "current-doc-test"
        
        result = await server._set_current_document({"doc_id": doc_id})
        
        assert len(result) == 1
        assert isinstance(result[0], TextContent)
        
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == doc_id
        assert "container_id" in response_data
        assert "message" in response_data

    @pytest.mark.asyncio
    async def test_append_with_current_document(self, server):
        """Test appending to current document without specifying doc_id"""
        doc_id = "current-append-test"
        text = "This is appended to current document"
        
        # First set the current document
        await server._set_current_document({"doc_id": doc_id})
        
        # Now append without specifying doc_id
        result = await server._append_paragraph({"text": text})
        
        assert len(result) == 1
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == doc_id
        assert response_data["text"] == text
        assert response_data["action"] == "append_paragraph"

    @pytest.mark.asyncio
    async def test_insert_with_current_document(self, server):
        """Test inserting into current document without specifying doc_id"""
        doc_id = "current-insert-test"
        text = "Inserted at current document"
        index = 0
        
        # First set the current document
        await server._set_current_document({"doc_id": doc_id})
        
        # Now insert without specifying doc_id
        result = await server._insert_paragraph({"index": index, "text": text})
        
        assert len(result) == 1
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == doc_id
        assert response_data["text"] == text
        assert response_data["index"] == index
        assert response_data["action"] == "insert_paragraph"

    @pytest.mark.asyncio
    async def test_get_info_with_current_document(self, server):
        """Test getting info about current document without specifying doc_id"""
        doc_id = "current-info-test"
        
        # First set the current document and add some content
        await server._set_current_document({"doc_id": doc_id})
        await server._append_paragraph({"text": "First paragraph"})
        await server._append_paragraph({"text": "Second paragraph"})
        
        # Now get info without specifying doc_id
        result = await server._get_document_info({})
        
        assert len(result) == 1
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == doc_id
        assert response_data["total_blocks"] == 2
        assert "container_id" in response_data

    @pytest.mark.asyncio
    async def test_error_when_no_current_document(self, server):
        """Test error handling when no current document is set"""
        # Import the module to reset current document
        import lexical_loro.mcp.server as server_module
        original_current = server_module.current_document_id
        server_module.current_document_id = None
        
        try:
            # Try to append without setting current document
            result = await server._append_paragraph({"text": "This should fail"})
            
            assert len(result) == 1
            response_data = json.loads(result[0].text)
            
            assert response_data["success"] is False
            assert "No document ID provided and no current document set" in response_data["error"]
        
        finally:
            # Restore original state
            server_module.current_document_id = original_current

    @pytest.mark.asyncio
    async def test_explicit_doc_id_overrides_current(self, server):
        """Test that providing explicit doc_id overrides current document"""
        current_doc = "current-doc"
        explicit_doc = "explicit-doc"
        text = "Text for explicit doc"
        
        # Set current document
        await server._set_current_document({"doc_id": current_doc})
        
        # Append to explicit document (should override current)
        result = await server._append_paragraph({"text": text, "doc_id": explicit_doc})
        
        assert len(result) == 1
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == explicit_doc  # Should be explicit, not current
        assert response_data["text"] == text

    @pytest.mark.asyncio
    async def test_workflow_with_current_document(self, server):
        """Test a complete workflow using current document"""
        doc_id = "workflow-test"
        
        # Set current document
        result = await server._set_current_document({"doc_id": doc_id})
        assert json.loads(result[0].text)["success"] is True
        
        # Add content without specifying doc_id
        result = await server._append_paragraph({"text": "First paragraph"})
        assert json.loads(result[0].text)["success"] is True
        
        result = await server._insert_paragraph({"index": 0, "text": "Inserted first"})
        assert json.loads(result[0].text)["success"] is True
        
        result = await server._append_paragraph({"text": "Last paragraph"})
        assert json.loads(result[0].text)["success"] is True
        
        # Check the final state
        result = await server._get_document_info({})
        response_data = json.loads(result[0].text)
        
        assert response_data["success"] is True
        assert response_data["doc_id"] == doc_id
        assert response_data["total_blocks"] == 3  # Three paragraphs added
