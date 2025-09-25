"""
Integration tests for MCP server document operations.

This module tests the MCP server's ability to create documents, append paragraphs,
and maintain proper document structure with text content.
"""

import logging
import pytest
import threading
import time
import aiohttp
from typing import Dict, Any

from lexical_loro.mcp import server


# Configure logging for test visibility
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%H:%M:%S'
)

logger = logging.getLogger(__name__)


@pytest.fixture(scope="module")
def mcp_server():
    """Start MCP server in background thread for testing."""
    logger.info("🚀 Starting MCP server for integration tests...")
    
    def start_server():
        # Import and start the server programmatically without CLI
        import sys
        from lexical_loro.model.document_manager import TreeDocumentManager
        from lexical_loro.mcp.server import MCPRequestHandler, ThreadedHTTPServer
        import socketserver
        from http.server import HTTPServer
        
        try:
            # Create document manager
            manager = TreeDocumentManager(base_path="./documents", websocket_url="ws://localhost:3002")
            
            # Create handler class with manager
            class TestMCPHandler(MCPRequestHandler):
                def __init__(self, *args, **kwargs):
                    super().__init__(*args, **kwargs)
                    self.document_manager = manager
            
            # Start server
            host, port = "localhost", 3001
            server = ThreadedHTTPServer((host, port), TestMCPHandler)
            logger.info(f"MCP server started on {host}:{port}")
            server.serve_forever()
            
        except Exception as e:
            logger.error(f"Failed to start MCP server: {e}")
    
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # Wait for server to start
    time.sleep(3)
    logger.info("📡 MCP server ready for testing")
    
    yield "http://localhost:3001"
    
    logger.info("🛑 Test session completed")


class TestMCPServerIntegration:
    """Integration tests for MCP server document operations."""
    
    @pytest.mark.asyncio
    async def test_document_lifecycle(self, mcp_server):
        """Test complete document lifecycle: create, append paragraphs, retrieve."""
        base_url = mcp_server
        doc_id = "test-lifecycle-doc"
        
        async with aiohttp.ClientSession() as session:
            
            # Test 1: Create document by appending first paragraph
            logger.info("📝 Test 1: Adding first paragraph to new document...")
            first_text = "This is the first paragraph added via MCP server"
            
            response_data = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 1,
                'method': 'append_paragraph',
                'params': {'doc_id': doc_id, 'text': first_text}
            })
            
            assert response_data['result']['success'] is True, "First paragraph append should succeed"
            assert 'added_node_id' in response_data['result'], "Should return added node ID"
            
            
            # Test 2: Add second paragraph to existing document
            logger.info("📝 Test 2: Adding second paragraph to existing document...")
            second_text = "This is the second paragraph added via MCP server"
            
            response_data = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 2,
                'method': 'append_paragraph',
                'params': {'doc_id': doc_id, 'text': second_text}
            })
            
            assert response_data['result']['success'] is True, "Second paragraph append should succeed"
            assert 'added_node_id' in response_data['result'], "Should return added node ID"
            
            
            # Test 3: Add third paragraph 
            logger.info("📝 Test 3: Adding third paragraph...")
            third_text = "This is the third and final paragraph"
            
            response_data = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 3,
                'method': 'append_paragraph',
                'params': {'doc_id': doc_id, 'text': third_text}
            })
            
            assert response_data['result']['success'] is True, "Third paragraph append should succeed"
            
            
            # Test 4: Get final document and validate structure
            logger.info("📋 Test 4: Retrieving final document structure...")
            response_data = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 4,
                'method': 'get_document',
                'params': {'doc_id': doc_id}
            })
            
            assert response_data['result']['success'] is True, "Document retrieval should succeed"
            
            # Validate document structure
            lexical_json = response_data['result']['lexical_json']
            root = lexical_json['root']
            
            assert root['type'] == 'root', "Root should have type 'root'"
            assert '__key' in root, "Root should have a key"
            
            # Should have 4 children: initial "New Document" + 3 added paragraphs
            children = root['children']
            expected_child_count = 4
            assert len(children) == expected_child_count, \
                f"Document should have {expected_child_count} children, got {len(children)}"
            
            
            # Test 5: Validate text content of all paragraphs
            logger.info("🔍 Test 5: Validating text content...")
            
            expected_texts = [
                "New Document",  # Initial document content
                first_text,
                second_text, 
                third_text
            ]
            
            actual_texts = []
            for i, child in enumerate(children):
                assert child['type'] == 'paragraph', f"Child {i} should be a paragraph"
                assert '__key' in child, f"Child {i} should have a key"
                
                # Extract text content
                if 'children' in child and len(child['children']) > 0:
                    text_node = child['children'][0]
                    if text_node.get('type') == 'text':
                        text_content = text_node.get('text', '')
                        actual_texts.append(text_content)
                    else:
                        actual_texts.append('')
                else:
                    actual_texts.append('')
                    
            logger.info(f"📊 Expected texts: {expected_texts}")
            logger.info(f"📊 Actual texts: {actual_texts}")
            
            # Validate each text matches expectation
            for i, (expected, actual) in enumerate(zip(expected_texts, actual_texts)):
                assert actual == expected, \
                    f"Paragraph {i} text mismatch. Expected: '{expected}', Got: '{actual}'"
                    
            logger.info("✅ All text content validation passed!")
            
    
    @pytest.mark.asyncio
    async def test_document_persistence(self, mcp_server):
        """Test that documents persist across multiple requests."""
        base_url = mcp_server
        doc_id = "test-persistence-doc"
        
        async with aiohttp.ClientSession() as session:
            
            # Add paragraph to create document
            await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 1,
                'method': 'append_paragraph',
                'params': {'doc_id': doc_id, 'text': 'Persistence test paragraph'}
            })
            
            # Get document first time
            response1 = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 2,
                'method': 'get_document',
                'params': {'doc_id': doc_id}
            })
            
            root_key_1 = response1['result']['lexical_json']['root']['__key']
            children_count_1 = len(response1['result']['lexical_json']['root']['children'])
            
            # Get document second time (should be same instance)
            response2 = await self._make_request(session, base_url, {
                'jsonrpc': '2.0',
                'id': 3,
                'method': 'get_document',
                'params': {'doc_id': doc_id}
            })
            
            root_key_2 = response2['result']['lexical_json']['root']['__key']
            children_count_2 = len(response2['result']['lexical_json']['root']['children'])
            
            # Document should be persistent (same structure)
            assert children_count_1 == children_count_2, "Document structure should persist"
            
            logger.info(f"📊 Persistence test - Root keys: {root_key_1} vs {root_key_2}")
            logger.info(f"📊 Persistence test - Children: {children_count_1} vs {children_count_2}")
            
    
    async def _make_request(self, session: aiohttp.ClientSession, base_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Make JSON-RPC request and return parsed response."""
        async with session.post(base_url, json=payload) as response:
            assert response.status == 200, f"HTTP request failed with status {response.status}"
            
            response_data = await response.json()
            
            # Check for JSON-RPC errors
            if 'error' in response_data:
                raise Exception(f"JSON-RPC error: {response_data['error']}")
                
            assert 'result' in response_data, "Response should contain 'result'"
            
            return response_data


if __name__ == "__main__":
    # Allow running this test directly for development
    import sys
    sys.exit(pytest.main([__file__, "-v", "-s"]))