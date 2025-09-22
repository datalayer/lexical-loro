# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""
MCP Server for Lexical-Loro Integration

This module provides MCP (Model Context Protocol) tools for managing collaborative
documents using Lexical JSON format with Loro CRDT backend.

KEY FEATURES:
============

Document Operations:
- get_document: Retrieve document content in Lexical JSON format
- append_paragraph: Add new paragraph to the document

Collaborative Backend:
- Loro CRDT for conflict-free concurrent editing
- Real-time synchronization capabilities
- Persistent document storage

MCP Integration:
- Standard JSON-RPC 2.0 protocol
- HTTP server with CORS support for browser integration
- Proper tools listing endpoint for frontend discovery
"""

import asyncio
import json
import logging
from typing import Any, Dict, Optional, List
from http.server import HTTPServer, BaseHTTPRequestHandler
import socketserver
from urllib.parse import urlparse, parse_qs
import threading

import click
from mcp import types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from ..model.tree_document_manager import TreeDocumentManager
from ..model.loro_tree_model import LoroTreeModel

logger = logging.getLogger(__name__)

###############################################################################
# Global document manager instance
document_manager: Optional[TreeDocumentManager] = None

# Create MCP server instance
server = Server("lexical-loro")

###############################################################################
# HTTP Handler for MCP JSON-RPC requests

class MCPHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Handle GET requests for tools listing"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/tools/list':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            # Return available tools
            tools = [
                {
                    "name": "get_document",
                    "description": "Get document content in Lexical JSON format"
                },
                {
                    "name": "append_paragraph", 
                    "description": "Append a new paragraph to the document"
                }
            ]
            
            self.wfile.write(json.dumps({"tools": tools}).encode())
        else:
            self.send_error(404)

    def do_POST(self):
        """Handle JSON-RPC requests"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            request = json.loads(post_data.decode())
            logger.info(f"Received JSON-RPC request: {request}")
            response = asyncio.run(self.handle_json_rpc(request))
            logger.info(f"Sending JSON-RPC response: {response}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
        except Exception as e:
            logger.error(f"Error handling request: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    async def handle_json_rpc(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle JSON-RPC 2.0 requests"""
        method = request.get('method')
        params = request.get('params', {})
        request_id = request.get('id')
        
        try:
            if method == 'get_document':
                result = await get_document(params.get('doc_id', 'default'))
            elif method == 'append_paragraph':
                result = await append_paragraph(
                    params.get('doc_id', 'default'),
                    params.get('text', '')
                )
            else:
                return {
                    "jsonrpc": "2.0",
                    "error": {"code": -32601, "message": "Method not found"},
                    "id": request_id
                }
            
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
        except Exception as e:
            logger.error(f"Error executing method {method}: {e}")
            return {
                "jsonrpc": "2.0", 
                "error": {"code": -32603, "message": str(e)},
                "id": request_id
            }

###############################################################################
# Initialization

def get_or_create_document_manager():
    """Get or create the global document manager instance"""
    global document_manager
    
    if document_manager is None:
        logger.info("Creating TreeDocumentManager...")
        document_manager = TreeDocumentManager(
            base_path="./documents",
            auto_save_interval=30,
            max_cached_documents=50
        )
        logger.info("TreeDocumentManager created successfully")
    
    return document_manager

###############################################################################
# MCP Tool Implementations

async def get_document(doc_id: str) -> Dict[str, Any]:
    """Get document content in Lexical JSON format.

    Args:
        doc_id: The unique identifier for the document

    Returns:
        Dict containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier  
            - lexical_json: Document content in Lexical JSON format
    """
    try:
        logger.info(f"Getting document: {doc_id}")
        
        # Get document manager
        manager = get_or_create_document_manager()
        
        # Create or get document
        model = manager.get_document(doc_id)
        if not model:
            model = manager.create_document(doc_id)
        
        # Convert Loro tree to Lexical JSON format
        lexical_json = _loro_tree_to_lexical_json(model)
        
        return {
            "success": True,
            "doc_id": doc_id,
            "lexical_json": lexical_json
        }
        
    except Exception as e:
        logger.error(f"Error getting document {doc_id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }

async def append_paragraph(doc_id: str, text: str) -> Dict[str, Any]:
    """Append a new paragraph to the document.

    Args:
        doc_id: The unique identifier for the document
        text: Text content for the new paragraph

    Returns:
        Dict containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier
            - added_node_id: ID of the newly added paragraph node
    """
    try:
        logger.info(f"Appending paragraph to document: {doc_id}")
        
        # Get document manager
        manager = get_or_create_document_manager()
        
        # Create or get document  
        model = manager.get_document(doc_id)
        if not model:
            model = manager.create_document(doc_id)
        
        # Add paragraph node to tree
        node_id = _add_paragraph_to_tree(model, text)
        
        return {
            "success": True,
            "doc_id": doc_id,
            "added_node_id": str(node_id)
        }
        
    except Exception as e:
        logger.error(f"Error appending paragraph to {doc_id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }

###############################################################################
# Private Helper Functions (tree operations)

def _loro_tree_to_lexical_json(model: LoroTreeModel) -> Dict[str, Any]:
    """Convert Loro tree to Lexical JSON format"""
    try:
        # Use existing converter if available
        if hasattr(model, 'to_lexical_json'):
            return model.to_lexical_json()
        
        # Fallback: basic conversion
        root_tree = model.get_tree()
        root_id = root_tree.id()
        
        # Create basic Lexical structure
        return {
            "root": {
                "children": [],
                "direction": None,
                "format": "",
                "indent": 0,
                "type": "root",
                "version": 1
            }
        }
        
    except Exception as e:
        logger.error(f"Error converting tree to Lexical JSON: {e}")
        # Return empty Lexical structure
        return {
            "root": {
                "children": [],
                "direction": None, 
                "format": "",
                "indent": 0,
                "type": "root",
                "version": 1
            }
        }

def _add_paragraph_to_tree(model: LoroTreeModel, text: str):
    """Add a paragraph node to the Loro tree"""
    try:
        root_tree = model.get_tree()
        
        # Create paragraph node
        paragraph_id = root_tree.create_at(0)  # Add at end
        
        # Set paragraph metadata
        tree_meta = root_tree.get_meta(paragraph_id)
        tree_meta.set("type", "paragraph")
        tree_meta.set("text", text)
        
        return paragraph_id
        
    except Exception as e:
        logger.error(f"Error adding paragraph to tree: {e}")
        raise

###############################################################################
# HTTP Server

class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Multi-threaded HTTP server for handling concurrent requests"""
    pass

###############################################################################
# CLI Interface

@click.command()
@click.option("--host", default="localhost", help="Host to bind the server to")
@click.option("--port", default=3001, help="Port to bind the server to")
@click.option("--documents-path", default="./documents", help="Path to store documents")
@click.option("--log-level", default="INFO", help="Logging level")
def main(host: str, port: int, documents_path: str, log_level: str):
    """Run the Lexical-Loro MCP server"""
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    logger.info(f"Starting Lexical-Loro MCP server on {host}:{port}")
    logger.info(f"Documents path: {documents_path}")
    
    # Initialize global document manager with custom path
    global document_manager
    document_manager = TreeDocumentManager(
        base_path=documents_path,
        auto_save_interval=30,
        max_cached_documents=50
    )
    
    # Create and run HTTP server
    server = ThreadedHTTPServer((host, port), MCPHandler)
    
    logger.info(f"MCP server started. Available at http://{host}:{port}")
    logger.info("Available tools:")
    logger.info("  - GET /tools/list - List available tools")
    logger.info("  - POST / - JSON-RPC 2.0 endpoint")
    logger.info("    - get_document(doc_id) - Get document in Lexical JSON format")
    logger.info("    - append_paragraph(doc_id, text) - Append paragraph to document")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down MCP server...")
        server.shutdown()


if __name__ == "__main__":
    main()