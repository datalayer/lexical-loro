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
from urllib.parse import urlparse
import loro

import click
from mcp.server import Server

from ..model.document_manager import TreeDocumentManager
from ..model.lexical_loro import LoroTreeModel

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

async def get_or_create_document_manager():
    """Get or create the global document manager instance"""
    global document_manager
    
    if document_manager is None:
        logger.info("Creating TreeDocumentManager...")
        document_manager = TreeDocumentManager(
            base_path="./documents",
            auto_save_interval=30,
            max_cached_documents=50
        )
        
        # Start background tasks in async context
        await document_manager.start_background_tasks_async()
        
        logger.info("TreeDocumentManager created successfully with background tasks")
    
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
        manager = await get_or_create_document_manager()
        
        # Get existing document or create if not found
        model = manager.get_document(doc_id)
        if not model:
            logger.info(f"📄 MCP SERVER: Document {doc_id} not found, creating empty document for WebSocket sync")
            # Create empty model without initializing content - let WebSocket populate it
            model = manager.create_document_for_websocket_sync(doc_id)
            logger.info(f"✅ MCP SERVER: Empty document created for {doc_id}, now connecting to WebSocket for content")
        else:
            logger.info(f"📄 MCP SERVER: Found existing document: {doc_id}")
        
        # Ensure WebSocket connection for collaborative sync
        logger.info(f"🔌 MCP SERVER: Ensuring WebSocket connection for document: {doc_id}")
        await _ensure_websocket_connection(model)
        logger.info(f"✅ MCP SERVER: WebSocket connection established for document: {doc_id}")
        
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
        manager = await get_or_create_document_manager()
        
        # Get existing document or create if not found
        model = manager.get_document(doc_id)
        if not model:
            logger.info(f"Document {doc_id} not found, creating new document")
            model = manager.create_document(doc_id)
        else:
            logger.info(f"Found existing document: {doc_id}")
        
        # Ensure WebSocket connection for collaborative sync
        await _ensure_websocket_connection(model)
        
        # Add paragraph node to tree
        node_id = await _add_paragraph_to_tree(model, text)
        
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

async def _ensure_websocket_connection(model: LoroTreeModel) -> None:
    """Ensure the model is connected to the WebSocket server for collaborative sync"""
    try:
        if not model.websocket_connected:
            logger.info(f"🔌 MCP SERVER: Connecting model to WebSocket server for doc: {model.doc_id}")
            await model.connect_to_websocket_server()
            
            # Wait a moment for the connection to stabilize and receive snapshot
            await asyncio.sleep(0.5)
            
            logger.info(f"✅ MCP SERVER: Model connected to WebSocket server for doc: {model.doc_id}")
            
            # Check if we received initial data
            if model._is_initialized:
                logger.info(f"📥 MCP SERVER: Document {model.doc_id} received initial snapshot data from WebSocket")
            else:
                logger.info(f"⏳ MCP SERVER: Document {model.doc_id} connected but no initial snapshot received yet")
                
        else:
            logger.debug(f"🔗 MCP SERVER: Model already connected to WebSocket server for doc: {model.doc_id}")
            
    except Exception as e:
        logger.error(f"❌ MCP SERVER: Failed to ensure WebSocket connection for doc {model.doc_id}: {e}")
        # Don't raise - allow operations to continue even without collaboration

def _loro_tree_to_lexical_json(model: LoroTreeModel) -> Dict[str, Any]:
    """Convert Loro tree to Lexical JSON format"""
    try:
        # Use the model's export method if initialized
        if hasattr(model, 'export_to_lexical_state') and model._is_initialized:
            lexical_json = model.export_to_lexical_state(log_structure=True)
            
            # Log what MCP server is returning to client
            root = lexical_json.get('root', {})
            children = root.get('children', [])
            logger.info(f"🔄 MCP SERVER RETURNING: Document {model.doc_id} with {len(children)} root children")
            for i, child in enumerate(children):
                child_type = child.get('type', 'unknown')
                child_key = child.get('__key', 'no-key')
                child_children = child.get('children', [])
                text_preview = ""
                if child_type == 'paragraph' and child_children:
                    text_nodes = [c for c in child_children if c.get('type') == 'text']
                    if text_nodes:
                        text_preview = f" - '{text_nodes[0].get('text', '')[:50]}'"
                logger.info(f"  └─ Child[{i}]: {child_type} (key: {child_key}, {len(child_children)} children){text_preview}")
            
            return lexical_json
        
        # Fallback: basic conversion for uninitialized models
        logger.warning(f"Model {model.doc_id} not fully initialized, returning empty Lexical structure")
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

async def _add_paragraph_to_tree(model: LoroTreeModel, text: str):
    """Add a paragraph node to the Loro tree and sync with WebSocket server"""
    try:
        # Capture version vector BEFORE making any changes for incremental updates
        from_version = model.doc.state_vv
        logger.info(f"🔍 MCP SERVER: Captured initial version: {from_version}")
        
        # Work directly with TreeIDs since we're in a tree-based system
        tree = model.tree
        
        # Find the root node - it should be the first node without a parent
        root_node = None
        for node in tree.get_nodes(False):
            if node.parent is None:
                root_node = node
                break
                
        if not root_node:
            raise ValueError("Cannot find root node in document tree")
            
        logger.info(f"📝 Adding paragraph to root TreeID: {root_node.id}")
        
        # Get current children count to append at the end
        existing_children = tree.children(root_node.id)
        child_count = len(list(existing_children)) if existing_children else 0
        
        # Create paragraph node
        paragraph_id = tree.create_at(child_count, root_node.id)
        paragraph_meta = tree.get_meta(paragraph_id)
        paragraph_meta.insert("elementType", "paragraph")
        paragraph_meta.insert("lexical", {
            "type": "paragraph",
            "format": "",
            "indent": 0,
            "textFormat": 0,
            "textStyle": ""
        })
        
        # Create text child node
        text_id = tree.create_at(0, paragraph_id)
        text_meta = tree.get_meta(text_id)
        text_meta.insert("elementType", "text")
        text_meta.insert("lexical", {
            "type": "text",
            "text": text,
            "format": 0,
            "style": "",
            "mode": 0,
            "detail": 0
        })
        
        node_id = paragraph_id
        
        # Commit the changes - the model's local update subscription will handle WebSocket propagation automatically
        model.doc.commit()
        logger.info(f"✅ MCP SERVER: Changes committed for doc {model.doc_id} - model will handle WebSocket propagation via subscription")
        
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