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
from typing import Any, Dict, Optional

import click
import uvicorn
from mcp.server import FastMCP
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from ..model.document_manager import TreeDocumentManager
from ..model.lexical_loro import LoroTreeModel

logger = logging.getLogger(__name__)

###############################################################################
# Global document manager instance
document_manager: Optional[TreeDocumentManager] = None

###############################################################################
# MCP Server with CORS support and legacy HTTP endpoints
class FastMCPWithCORS(FastMCP):
    def streamable_http_app(self) -> Starlette:
        """Return StreamableHTTP server app with CORS middleware and legacy endpoints
        See: https://github.com/modelcontextprotocol/python-sdk/issues/187
        """
        # Get the original Starlette app
        app = super().streamable_http_app()
        
        # Add CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # In production, should set specific domains
            allow_credentials=True,
            allow_methods=["*"],  
            allow_headers=["*"],
        )
        
        # Add legacy HTTP endpoints for frontend compatibility
        app.router.routes.append(Route("/tools/list", self.legacy_tools_list, methods=["GET", "OPTIONS"]))
        app.router.routes.append(Route("/", self.legacy_json_rpc, methods=["POST", "OPTIONS"]))
        
        return app
    
    def sse_app(self, mount_path: str | None = None) -> Starlette:
        """Return SSE server app with CORS middleware"""
        # Get the original Starlette app
        app = super().sse_app(mount_path)
        # Add CORS middleware
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # In production, should set specific domains
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        return app
    
    async def legacy_tools_list(self, request: Request) -> JSONResponse:
        """Legacy endpoint for GET /tools/list - maintains frontend compatibility"""
        if request.method == "OPTIONS":
            return JSONResponse(
                content={},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            )
        
        tools = [
            {
                "name": "load_document",
                "description": "Load a document by document ID"
            },
            {
                "name": "get_document", 
                "description": "Get document content in Lexical JSON format"
            },
            {
                "name": "get_document_info",
                "description": "Get document info and statistics"
            },
            {
                "name": "append_paragraph",
                "description": "Append a new paragraph to the document"
            },
            {
                "name": "insert_paragraph",
                "description": "Insert a paragraph at a specific index"
            }
        ]
        
        return JSONResponse(
            content={"tools": tools},
            headers={"Access-Control-Allow-Origin": "*"}
        )
    
    async def legacy_json_rpc(self, request: Request) -> JSONResponse:
        """Legacy endpoint for POST / - handles JSON-RPC requests and calls MCP tools"""
        if request.method == "OPTIONS":
            return JSONResponse(
                content={},
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", 
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            )
        
        try:
            body = await request.json()
            method = body.get('method')
            params = body.get('params', {})
            request_id = body.get('id')
            
            logger.debug(f"Legacy JSON-RPC request: {method} with params: {params}")
            
            # Route to appropriate MCP tool
            if method == 'get_document':
                result_str = await get_document(params.get('doc_id', 'default'))
                result = json.loads(result_str)
            elif method == 'append_paragraph':
                result_str = await append_paragraph(
                    params.get('doc_id', 'default'),
                    params.get('text', '')
                )
                result = json.loads(result_str)
            elif method == 'load_document':
                result_str = await load_document(params.get('doc_id', 'default'))
                result = json.loads(result_str)
            elif method == 'get_document_info':
                result_str = await get_document_info(params.get('doc_id', 'default'))
                result = json.loads(result_str)
            elif method == 'insert_paragraph':
                result_str = await insert_paragraph(
                    params.get('doc_id', 'default'),
                    params.get('index', 0),
                    params.get('text', '')
                )
                result = json.loads(result_str)
            else:
                return JSONResponse(
                    content={
                        "jsonrpc": "2.0",
                        "error": {"code": -32601, "message": "Method not found"},
                        "id": request_id
                    },
                    headers={"Access-Control-Allow-Origin": "*"}
                )
            
            response = {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id
            }
            
            logger.debug(f"Legacy JSON-RPC response: {response}")
            
            return JSONResponse(
                content=response,
                headers={"Access-Control-Allow-Origin": "*"}
            )
            
        except Exception as e:
            logger.error(f"Error in legacy JSON-RPC handler: {e}")
            return JSONResponse(
                content={
                    "jsonrpc": "2.0",
                    "error": {"code": -32603, "message": str(e)},
                    "id": request_id if 'request_id' in locals() else None
                },
                headers={"Access-Control-Allow-Origin": "*"},
                status_code=500
            )

# Create MCP server instance
mcp = FastMCPWithCORS("lexical-loro", stateless_http=True)

###############################################################################
# Document Manager Initialization

async def get_or_create_document_manager() -> TreeDocumentManager:
    """Get or create the global document manager instance"""
    global document_manager
    
    if document_manager is None:
        logger.debug("🔧 MCP SERVER: Creating TreeDocumentManager...")
        document_manager = TreeDocumentManager(
            base_path="./documents",
            auto_save_interval=30,
            max_cached_documents=50
        )
        
        # Start background tasks in async context
        await document_manager.start_background_tasks_async()
        
        logger.debug("✅ MCP SERVER: TreeDocumentManager created")
    
    return document_manager

# Helper function for ensuring document synchronization
async def _ensure_document_synced(doc_id: str):
    """Ensure document is properly synchronized with WebSocket server before reading"""
    model = document_manager.get_document(doc_id)
    if not model:
        logger.debug(f"� MCP SERVER: Document {doc_id} not found, creating empty document for WebSocket sync")
        model = document_manager.create_document_for_websocket_sync(doc_id)
    
    # Ensure WebSocket connection for collaborative sync
    await _ensure_websocket_connection(model)
    
    # Wait a moment for synchronization
    await asyncio.sleep(0.5)
    
    return model

###############################################################################
# MCP Tools

@mcp.tool()
async def get_document(doc_id: str) -> str:
    """Get document content in Lexical JSON format.

    Args:
        doc_id: The unique identifier for the document

    Returns:
        JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier  
            - lexical_json: Document content in Lexical JSON format
    """
    try:
        logger.debug(f"Getting document: {doc_id}")
        
        # Get document manager
        manager = await get_or_create_document_manager()
        
        # Get existing document or create if not found
        model = manager.get_document(doc_id)
        if not model:
            logger.debug(f"📄 MCP SERVER: Document {doc_id} not found, creating empty document for WebSocket sync")
            # Create empty model without initializing content - let WebSocket populate it
            model = manager.create_document_for_websocket_sync(doc_id)
            logger.debug(f"✅ MCP SERVER: Empty document created for {doc_id}, now connecting to WebSocket for content")
        else:
            logger.debug(f"📄 MCP SERVER: Found existing document: {doc_id}")
        
        # Ensure WebSocket connection for collaborative sync
        logger.debug(f"🔌 MCP SERVER: Ensuring WebSocket connection for document: {doc_id}")
        await _ensure_websocket_connection(model)
        logger.debug(f"✅ MCP SERVER: WebSocket connection established for document: {doc_id}")
        
        # Convert Loro tree to Lexical JSON format
        lexical_json = _loro_tree_to_lexical_json(model)
        
        result = {
            "success": True,
            "doc_id": doc_id,
            "lexical_json": lexical_json
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting document {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }
        return json.dumps(error_result, indent=2)

@mcp.tool()
async def load_document(doc_id: str) -> str:
    """Load a Lexical document by document ID and retrieve its complete structure.
    
    This tool loads an existing document or creates a new one if it doesn't exist.
    The document uses Loro's collaborative editing backend for real-time synchronization.
    Returns the complete lexical data structure including all blocks, metadata, and
    container information for collaborative editing.

    Args:
        doc_id: The unique identifier of the document to load (REQUIRED). Can be any string
               that serves as a document identifier (e.g., "my-doc", "report-2024").

    Returns:
        JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier that was loaded
            - lexical_data: Complete lexical document structure with root and children blocks
            - container_id: Loro container ID for collaborative editing synchronization
    """
    try:
        logger.info(f"Loading document: {doc_id}")
        
        # Ensure document is properly synchronized before reading
        model = await _ensure_document_synced(doc_id)
        
        # Get the lexical data from the model
        lexical_json = _loro_tree_to_lexical_json(model)
        
        # Format the response
        result = {
            "success": True,
            "doc_id": doc_id,
            "lexical_data": lexical_json,
            "container_id": doc_id  # Use doc_id as container_id for compatibility
        }
        
        logger.info(f"Successfully loaded document: {doc_id}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error loading document {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }
        return json.dumps(error_result, indent=2)

@mcp.tool()
async def get_document_info(doc_id: str) -> str:
    """Get comprehensive information about a document including structure, statistics, and metadata.
    
    This tool provides detailed analysis of document content, structure, and metadata 
    without returning the full document content. It's useful for understanding document 
    composition, tracking changes, and getting quick insights about document statistics.

    Args:
        doc_id: The unique identifier of the document to inspect (REQUIRED).

    Returns:
        JSON string containing comprehensive document information:
            - success: Boolean indicating operation success
            - doc_id: The document identifier that was inspected
            - container_id: Container ID for collaborative editing tracking
            - total_blocks: Total number of content blocks in the document
            - block_types: Dictionary with count of each block type
            - content_preview: Preview of document content
            - lexical_data: Complete document structure for analysis
    """
    try:
        logger.info(f"Getting document info for: {doc_id}")
        
        # Ensure document is properly synchronized before reading
        model = await _ensure_document_synced(doc_id)
        
        # Get lexical data directly from the model
        lexical_json = _loro_tree_to_lexical_json(model)
        children = lexical_json.get("root", {}).get("children", [])
        
        # Count different block types
        block_types = {}
        content_preview = []
        
        for i, child in enumerate(children):
            block_type = child.get("type", "unknown")
            block_types[block_type] = block_types.get(block_type, 0) + 1
            
            # Extract text content for preview
            if block_type == "paragraph":
                text_content = ""
                child_children = child.get("children", [])
                for text_node in child_children:
                    if text_node.get("type") == "text":
                        text_content += text_node.get("text", "")
                preview = text_content[:100] + "..." if len(text_content) > 100 else text_content
                content_preview.append(f"Block {i}: [{block_type}] '{preview}'")
            else:
                content_preview.append(f"Block {i}: [{block_type}] (non-text content)")
        
        # Build comprehensive info including the full lexical document structure
        result = {
            "success": True,
            "doc_id": doc_id,
            "container_id": doc_id,
            "total_blocks": len(children),
            "block_types": block_types,
            "content_preview": content_preview,
            "last_saved": lexical_json.get("lastSaved"),
            "version": lexical_json.get("version"),
            "source": lexical_json.get("source"),
            "lexical_data": lexical_json
        }
        
        logger.info(f"Successfully retrieved document info for {doc_id}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error getting document info for {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }
        return json.dumps(error_result, indent=2)

@mcp.tool()
async def insert_paragraph(doc_id: str, index: int, text: str) -> str:
    """Insert a text paragraph at a specific position in a Lexical document.
    
    This tool inserts a new paragraph block at the specified index position within
    the document. All existing blocks at or after the specified index will be shifted
    down by one position. The document uses Loro's collaborative editing backend,
    so changes are automatically synchronized across all connected clients.

    Args:
        doc_id: The unique identifier of the document (REQUIRED).
        index: The zero-based index position where to insert the paragraph.
               Use 0 to insert at the beginning, or any valid index within the document.
               If index exceeds document length, paragraph is appended at the end.
        text: The text content of the paragraph to insert. Can contain any UTF-8 text
              including emojis, special characters, and multi-line content.

    Returns:
        JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier where insertion occurred
            - action: "insert_paragraph" for operation tracking
            - index: The actual index where paragraph was inserted
            - text: The text content that was inserted
            - total_blocks: Updated total number of blocks in the document
    """
    try:
        logger.info(f"Inserting paragraph in document {doc_id} at index {index}")
        
        # Get document manager
        manager = await get_or_create_document_manager()
        
        # Get existing document or create if not found
        model = manager.get_document(doc_id)
        if not model:
            logger.debug(f"Document {doc_id} not found, creating new document")
            model = manager.create_document(doc_id)
        
        # Ensure WebSocket connection for collaborative sync
        await _ensure_websocket_connection(model)
        
        # Add paragraph node to tree at specified index
        node_id = await _add_paragraph_to_tree_at_index(model, text, index)
        
        # Get updated document structure for response
        lexical_json = _loro_tree_to_lexical_json(model)
        total_blocks = len(lexical_json.get("root", {}).get("children", []))
        
        result = {
            "success": True,
            "doc_id": doc_id,
            "action": "insert_paragraph",
            "index": index,
            "text": text,
            "total_blocks": total_blocks,
            "added_node_id": str(node_id)
        }
        
        logger.info(f"Successfully inserted paragraph in document {doc_id} at index {index}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error inserting paragraph in document {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id,
            "action": "insert_paragraph"
        }
        return json.dumps(error_result, indent=2)

@mcp.tool()
async def append_paragraph(doc_id: str, text: str) -> str:
    """Append a new paragraph to the document.

    Args:
        doc_id: The unique identifier for the document
        text: Text content for the new paragraph

    Returns:
        JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier
            - added_node_id: ID of the newly added paragraph node
    """
    try:
        logger.debug(f"Appending paragraph to document: {doc_id}")
        
        # Get document manager
        manager = await get_or_create_document_manager()
        
        # Get existing document or create if not found
        model = manager.get_document(doc_id)
        if not model:
            logger.debug(f"Document {doc_id} not found, creating new document")
            model = manager.create_document(doc_id)
        else:
            logger.debug(f"Found existing document: {doc_id}")
        
        # Ensure WebSocket connection for collaborative sync
        await _ensure_websocket_connection(model)
        
        # Add paragraph node to tree
        node_id = await _add_paragraph_to_tree(model, text)
        
        result = {
            "success": True,
            "doc_id": doc_id,
            "added_node_id": str(node_id)
        }
        
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error appending paragraph to {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }
        return json.dumps(error_result, indent=2)

###############################################################################
# Private Helper Functions (tree operations)

async def _ensure_websocket_connection(model: LoroTreeModel) -> None:
    """Ensure the model is connected to the WebSocket server for collaborative sync"""
    try:
        logger.debug(f"🔍 MCP SERVER: Checking WebSocket connection status for doc: {model.doc_id}")
        logger.debug(f"🔍 MCP SERVER: Current websocket_connected status: {model.websocket_connected}")
        logger.debug(f"� MCP SERVER: WebSocket URL: {getattr(model, 'websocket_url', 'Not set')}")
        
        if not model.websocket_connected:
            logger.debug(f"🔌 MCP SERVER: *** INITIATING WEBSOCKET CONNECTION *** for doc: {model.doc_id}")
            logger.debug(f"🔌 MCP SERVER: About to call model.connect_to_websocket_server()...")
            
            await model.connect_to_websocket_server()
            
            logger.debug(f"🔌 MCP SERVER: connect_to_websocket_server() completed")
            logger.debug(f"🔌 MCP SERVER: New connection status: {model.websocket_connected}")
            
            # Wait a moment for the connection to stabilize and receive snapshot
            logger.debug(f"⏳ MCP SERVER: Waiting 0.5s for connection to stabilize...")
            await asyncio.sleep(0.5)
            
            logger.debug(f"✅ MCP SERVER: *** WEBSOCKET CONNECTION ESTABLISHED *** for doc: {model.doc_id}")
            logger.debug(f"✅ MCP SERVER: Connection status: {model.websocket_connected}")
            logger.debug(f"✅ MCP SERVER: Has WebSocket object: {model.websocket is not None}")
            logger.debug(f"✅ MCP SERVER: Has message listener task: {model._websocket_task is not None}")
            
            # Check if we received initial data
            if model._is_initialized:
                logger.debug(f"📥 MCP SERVER: *** DOCUMENT INITIALIZED *** - {model.doc_id} received initial snapshot data from WebSocket")
            else:
                logger.warning(f"⏳ MCP SERVER: *** DOCUMENT NOT INITIALIZED *** - {model.doc_id} connected but no initial snapshot received yet")
                
        else:
            logger.debug(f"🔗 MCP SERVER: *** ALREADY CONNECTED *** - Model already connected to WebSocket server for doc: {model.doc_id}")
            logger.debug(f"🔗 MCP SERVER: Connection details - websocket_connected: {model.websocket_connected}, has_websocket: {model.websocket is not None}")
            logger.debug(f"🔗 MCP SERVER: REUSING existing connection (PERSISTENT document manager prevents disconnection)")
            logger.debug(f"🔗 MCP SERVER: Keepalive task running: {model._keepalive_task is not None and not model._keepalive_task.done()}")
            logger.debug(f"🔗 MCP SERVER: Monitor task running: {model._monitor_task is not None and not model._monitor_task.done()}")
            
    except Exception as e:
        logger.error(f"❌ MCP SERVER: *** WEBSOCKET CONNECTION FAILED *** for doc {model.doc_id}: {e}")
        import traceback
        logger.error(f"❌ MCP SERVER: Connection failure traceback: {traceback.format_exc()}")
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
            logger.debug(f"🔄 MCP SERVER RETURNING: Document {model.doc_id} with {len(children)} root children")
            for i, child in enumerate(children):
                child_type = child.get('type', 'unknown')
                child_key = child.get('__key', 'no-key')
                child_children = child.get('children', [])
                text_preview = ""
                if child_type == 'paragraph' and child_children:
                    text_nodes = [c for c in child_children if c.get('type') == 'text']
                    if text_nodes:
                        text_preview = f" - '{text_nodes[0].get('text', '')[:50]}'"
                logger.debug(f"  └─ Child[{i}]: {child_type} (key: {child_key}, {len(child_children)} children){text_preview}")
            
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

async def _add_paragraph_to_tree_at_index(model: LoroTreeModel, text: str, index: int):
    """Add a paragraph node to the Loro tree at a specific index and sync with WebSocket server"""
    try:
        # Capture version vector BEFORE making any changes for incremental updates
        from_version = model.doc.state_vv
        logger.debug(f"🔍 MCP SERVER: Captured initial version: {from_version}")
        
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
            
        logger.debug(f"📝 Adding paragraph to root TreeID: {root_node.id}")
        
        # Get current children count and adjust index
        existing_children = tree.children(root_node.id)
        child_count = len(list(existing_children)) if existing_children else 0
        
        # Clamp index to valid range
        insert_index = min(max(0, index), child_count)
        
        # Create paragraph node at specified index
        paragraph_id = tree.create_at(insert_index, root_node.id)
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
        
        # Commit the changes - the model's local update subscription will handle WebSocket propagation automatically
        model.doc.commit()
        logger.debug(f"✅ MCP SERVER: Changes committed for doc {model.doc_id} at index {insert_index}")
        
        return paragraph_id
    except Exception as e:
        logger.error(f"Error adding paragraph to tree at index {index}: {e}")
        raise

async def _add_paragraph_to_tree(model: LoroTreeModel, text: str):
    """Add a paragraph node to the Loro tree and sync with WebSocket server"""
    try:
        # Capture version vector BEFORE making any changes for incremental updates
        from_version = model.doc.state_vv
        logger.debug(f"🔍 MCP SERVER: Captured initial version: {from_version}")
        
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
            
        logger.debug(f"📝 Adding paragraph to root TreeID: {root_node.id}")
        
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
        logger.debug(f"✅ MCP SERVER: Changes committed for doc {model.doc_id} - model will handle WebSocket propagation via subscription")
        
        return paragraph_id
    except Exception as e:
        logger.error(f"Error adding paragraph to tree: {e}")
        raise

###############################################################################
# CLI Interface

@click.group()
def server():
    """Manages Lexical Loro MCP Server."""
    pass

@server.command("start")
@click.option(
    "--transport",
    envvar="TRANSPORT",
    type=click.Choice(["stdio", "streamable-http"]),
    default="stdio",
    help="The transport to use for the MCP server. Defaults to 'stdio'.",
)
@click.option(
    "--port",
    envvar="PORT",
    type=click.INT,
    default=4041,
    help="The port to bind to for the Streamable HTTP transport. Ignored for stdio transport.",
)
@click.option(
    "--host",
    envvar="HOST",
    type=click.STRING,
    default="0.0.0.0",
    help="The host to bind to for the Streamable HTTP transport. Ignored for stdio transport.",
)
@click.option(
    "--websocket-url",
    envvar="WEBSOCKET_URL", 
    type=click.STRING,
    default="ws://localhost:8081",
    help="The base WebSocket URL for collaborative editing. Defaults to 'ws://localhost:8081'.",
)
@click.option(
    "--documents-path",
    default="./documents",
    help="Path to store documents"
)
@click.option(
    "--log-level",
    envvar="LOG_LEVEL",
    type=click.Choice(["DEBUG", "INFO", "WARNING", "ERROR"]),
    default="INFO",
    help="Set the logging level.",
)
def start_command(
    transport: str,
    port: int,
    host: str,
    websocket_url: str,
    documents_path: str,
    log_level: str,
):
    """Start the Lexical Loro MCP server with a transport."""
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize global document manager with custom path
    global document_manager
    logger.debug("🔧 MCP SERVER CLI: Initializing document manager...")
    document_manager = TreeDocumentManager(
        base_path=documents_path,
        auto_save_interval=30,
        max_cached_documents=50
    )
    logger.debug("✅ MCP SERVER CLI: Document manager initialized")
    
    logger.info(f"Starting Lexical Loro MCP Server with transport: {transport}")
    logger.info(f"WebSocket base URL: {websocket_url}")
    logger.info(f"Documents path: {documents_path}")
    
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport == "streamable-http":
        logger.info(f"Starting server on {host}:{port}")
        uvicorn.run(mcp.streamable_http_app, host=host, port=port)
    else:
        raise ValueError("Transport should be 'stdio' or 'streamable-http'.")

# Legacy main command for backward compatibility
@click.command()
@click.option("--host", default="localhost", help="Host to bind the server to")
@click.option("--port", default=3001, help="Port to bind the server to")
@click.option("--documents-path", default="./documents", help="Path to store documents")
@click.option("--log-level", default="INFO", help="Logging level")
def main(host: str, port: int, documents_path: str, log_level: str):
    """Run the Lexical-Loro MCP server (legacy interface - use streamable-http transport)"""
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level.upper()),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    logger.debug(f"Starting Lexical-Loro MCP server on {host}:{port}")
    logger.debug(f"Documents path: {documents_path}")
    
    # Initialize global document manager with custom path
    global document_manager
    logger.debug("🔧 MCP SERVER CLI: Initializing document manager...")
    document_manager = TreeDocumentManager(
        base_path=documents_path,
        auto_save_interval=30,
        max_cached_documents=50
    )
    logger.debug("✅ MCP SERVER CLI: Document manager initialized")
    
    logger.debug(f"MCP server started. Available at http://{host}:{port}")
    logger.debug("Available tools:")
    logger.debug("  - load_document(doc_id) - Load document structure")
    logger.debug("  - get_document(doc_id) - Get document in Lexical JSON format")  
    logger.debug("  - get_document_info(doc_id) - Get document statistics and info")
    logger.debug("  - append_paragraph(doc_id, text) - Append paragraph to document")
    logger.debug("  - insert_paragraph(doc_id, index, text) - Insert paragraph at index")
    
    try:
        # Use streamable-http transport for the legacy interface
        uvicorn.run(mcp.streamable_http_app, host=host, port=port)
    except KeyboardInterrupt:
        logger.debug("Shutting down MCP server...")


if __name__ == "__main__":
    main()