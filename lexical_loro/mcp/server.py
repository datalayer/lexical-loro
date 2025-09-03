# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import asyncio
import json
import logging
from typing import Any, Dict, Optional

import click
import uvicorn
from mcp.server import FastMCP
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware

from ..model.lexical_model import LexicalDocumentManager


###############################################################################


logger = logging.getLogger(__name__)


###############################################################################
# Global document manager instance
document_manager: Optional[LexicalDocumentManager] = None


###############################################################################
# MCP Server with CORS

class FastMCPWithCORS(FastMCP):
    def streamable_http_app(self) -> Starlette:
        """Return StreamableHTTP server app with CORS middleware
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


###############################################################################
# MCP Server

# Create the FastMCP server
mcp = FastMCPWithCORS(name="Lexical MCP Server", json_response=False, stateless_http=True)

# Initialize document manager
async def initialize_mcp_collaboration(websocket_base_url: str):
    """Initialize MCP server with standard LexicalDocumentManager in client mode"""
    global document_manager
    
    def handle_document_events(event_type: str, event_data: dict):
        """Handle events from document models, especially BROADCAST_NEEDED"""
        if event_type == "broadcast_needed" and document_manager.client_mode:
            # Get the document that emitted the event
            doc_id = event_data.get("doc_id")
            if doc_id and doc_id in document_manager.models:
                logger.debug(f"🔥 MCP: Handling BROADCAST_NEEDED event for doc '{doc_id}', calling broadcast_change()")
                # Extract broadcast data from the event - this contains the pre-built message
                broadcast_data = {k: v for k, v in event_data.items() if k != "doc_id"}
                # Call broadcast_change with the pre-built data
                asyncio.create_task(document_manager.broadcast_change_with_data(doc_id, broadcast_data))
    
    # Create standard document manager with client mode enabled
    # WebSocket connections will be created per document ID
    document_manager = LexicalDocumentManager(
        event_callback=handle_document_events,  # Handle BROADCAST_NEEDED events
        ephemeral_timeout=300000,
        client_mode=True,  # Enable WebSocket client mode for collaboration
        websocket_base_url=websocket_base_url  # Base URL for WebSocket connections
    )
    
    # Start the client mode (connections will be created per document)
    await document_manager.start_client_mode()
    
    logger.info(f"🚀 MCP server initialized with collaborative LexicalDocumentManager")
    logger.info(f"🔌 Client mode enabled: {document_manager.client_mode}")
    logger.info(f"🔗 WebSocket base URL: {document_manager.websocket_base_url}")

# Initialize with default settings when NOT in async context
def sync_initialize_mcp_collaboration(websocket_base_url: str):
    """Synchronous initialization for module loading"""
    global document_manager
    
    def handle_document_events(event_type: str, event_data: dict):
        """Handle events from document models, especially BROADCAST_NEEDED"""
        if event_type == "broadcast_needed" and document_manager.client_mode:
            # Get the document that emitted the event
            doc_id = event_data.get("doc_id")
            if doc_id and doc_id in document_manager.models:
                logger.debug(f"🔥 MCP: Handling BROADCAST_NEEDED event for doc '{doc_id}', calling broadcast_change()")
                # Extract broadcast data from the event - this contains the pre-built message
                broadcast_data = {k: v for k, v in event_data.items() if k != "doc_id"}
                # Call broadcast_change with the pre-built data
                asyncio.create_task(document_manager.broadcast_change_with_data(doc_id, broadcast_data))
    
    # Create standard document manager with client mode enabled  
    # Connections will be established per document when needed
    document_manager = LexicalDocumentManager(
        event_callback=handle_document_events,  # Handle BROADCAST_NEEDED events
        ephemeral_timeout=300000,
        client_mode=True,
        websocket_base_url=websocket_base_url
    )
    
    logger.info(f"🚀 MCP server initialized with collaborative LexicalDocumentManager")
    logger.info(f"🔌 Client mode enabled: {document_manager.client_mode}")
    logger.info(f"🔗 WebSocket base URL: {document_manager.websocket_base_url}")

# Default initialization will be deferred until server start


def set_document_manager(manager: LexicalDocumentManager) -> None:
    """Set a custom document manager that extends LexicalDocumentManager.
    
    This allows for custom implementations of document management with
    different storage backends, synchronization strategies, or additional features.
    
    Args:
        manager: An instance that extends LexicalDocumentManager
        
    Raises:
        TypeError: If manager is not an instance of LexicalDocumentManager
    """
    global document_manager
    if not isinstance(manager, LexicalDocumentManager):
        raise TypeError(f"Document manager must be an instance of LexicalDocumentManager, got {type(manager)}")
    
    document_manager = manager
    logger.info(f"Document manager set to: {type(manager).__name__}")


def get_document_manager() -> LexicalDocumentManager:
    """Get the current document manager instance.
    
    Returns:
        The current document manager instance
    """
    return document_manager


###############################################################################
# MCP Tools


@mcp.tool()
async def load_document(doc_id: str) -> str:
    """Load a Lexical document by document ID and retrieve its complete structure.

    This tool loads an existing document or creates a new one if it doesn't exist.
    The document uses Loro's collaborative editing backend for real-time synchronization.
    Returns the complete lexical data structure including all blocks, metadata, and
    container information for collaborative editing.

    IMPORTANT: You MUST provide a doc_id parameter to specify which document to load.
    There is no default or current document - every operation requires an explicit doc_id.

    Args:
        doc_id: The unique identifier of the document to load (REQUIRED). Can be any string
               that serves as a document identifier (e.g., "my-doc", "report-2024").
               Documents are automatically created if they don't exist. You cannot omit
               this parameter - every call must specify which document to operate on.

    Returns:
        str: JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier that was loaded
            - lexical_data: Complete lexical document structure with root and children blocks
            - container_id: Loro container ID for collaborative editing synchronization
            - On error: success=False with error message and doc_id

    Example Usage:
        Load existing document: load_document("project-notes")
        Create new document: load_document("new-document-2024")
    """
    try:
        logger.info(f"Loading document: {doc_id}")
        
        # Get or create the document using the document manager
        model = document_manager.get_or_create_document(doc_id)
        
        # Get the lexical data from the model
        lexical_data = model.get_lexical_data()
        
        # Format the response
        result = {
            "success": True,
            "doc_id": doc_id,
            "lexical_data": lexical_data,
            "container_id": model.container_id
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
    """Retrieve comprehensive information and metadata about a Lexical document.

    This tool provides detailed information about a document's structure, content,
    and metadata without returning the full document content. It's useful for
    understanding document composition, tracking changes, and getting quick insights
    about document statistics before performing operations.

    IMPORTANT: You MUST provide a doc_id parameter to specify which document to inspect.
    There is no default or current document - every operation requires an explicit doc_id.

    Args:
        doc_id: The unique identifier of the document to inspect (REQUIRED). You cannot
               omit this parameter - every call must specify which document to operate on.

    Returns:
        str: JSON string containing comprehensive document information:
            - success: Boolean indicating operation success
            - doc_id: The document identifier that was inspected
            - container_id: Loro container ID for collaborative editing tracking
            - total_blocks: Total number of content blocks in the document
            - block_types: Dictionary with count of each block type (e.g., {"paragraph": 5})
            - last_saved: Timestamp of last save operation (if available)
            - version: Document version information (if available)
            - source: Source information about document origin (if available)
            - On error: success=False with error message and context

    Example Usage:
        Check specific doc: get_document_info("project-notes")
        Inspect before editing: get_document_info("draft-2024")

    Use Cases:
        - Document structure analysis before bulk operations
        - Content auditing and statistics
        - Version tracking and change monitoring
        - Debugging document state issues
    """
    try:
        logger.info(f"Getting document info for: {doc_id}")
        
        # Get or create the document
        model = document_manager.get_or_create_document(doc_id)
        
        # Get lexical data
        lexical_data = model.get_lexical_data()
        children = lexical_data.get("root", {}).get("children", [])
        
        # Count different block types
        block_types = {}
        for child in children:
            block_type = child.get("type", "unknown")
            block_types[block_type] = block_types.get(block_type, 0) + 1
        
        result = {
            "success": True,
            "doc_id": doc_id,
            "container_id": model.container_id,
            "total_blocks": len(children),
            "block_types": block_types,
            "last_saved": lexical_data.get("lastSaved"),
            "version": lexical_data.get("version"),
            "source": lexical_data.get("source")
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
async def insert_paragraph(index: int, text: str, doc_id: str) -> str:
    """Insert a text paragraph at a specific position in a Lexical document.

    This tool inserts a new paragraph block at the specified index position within
    the document. All existing blocks at or after the specified index will be shifted
    down by one position. The document uses Loro's collaborative editing backend,
    so changes are automatically synchronized across all connected clients.

    Uses the same SAFE incremental operations as append_paragraph to prevent
    race conditions and ensure collaborative stability.

    IMPORTANT: You MUST provide a doc_id parameter to specify which document to modify.
    There is no default or current document - every operation requires an explicit doc_id.

    Args:
        index: The zero-based index position where to insert the paragraph.
               Use 0 to insert at the beginning, or any valid index within the document.
               If index exceeds document length, paragraph is appended at the end.
        text: The text content of the paragraph to insert. Can contain any UTF-8 text
              including emojis, special characters, and multi-line content.
        doc_id: The unique identifier of the document (REQUIRED). You cannot omit this
               parameter - every call must specify which document to operate on.

    Returns:
        str: JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier where insertion occurred
            - action: "insert_paragraph" for operation tracking
            - index: The actual index where paragraph was inserted
            - text: The text content that was inserted
            - total_blocks: Updated total number of blocks in the document
            - On error: success=False with error message and context

    Example Usage:
        Insert at beginning: insert_paragraph(0, "Introduction paragraph", "my-doc")
        Insert with doc: insert_paragraph(2, "Middle content", "my-doc")
    """
    try:
        logger.info(f"🚀🚀🚀 insert_paragraph FUNCTION CALLED with text='{text}', index={index}, doc_id='{doc_id}'")
        logger.info(f"Inserting paragraph in document {doc_id} at index {index}")
        
        # Get or create the document
        model = document_manager.get_or_create_document(doc_id)
        
        # Create paragraph structure with message data 
        block_detail = {"text": text}
        
        # Insert the paragraph at the specified index using SAFE operations
        result = await model.add_block_at_index(index, block_detail, "paragraph")
        
        # Get updated document structure  
        lexical_data = model.get_lexical_data()
        total_blocks = len(lexical_data.get("root", {}).get("children", []))
        
        result = {
            "success": True,
            "doc_id": doc_id,
            "action": "insert_paragraph",
            "index": index,
            "text": text,
            "total_blocks": total_blocks
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
async def append_paragraph(text: str, doc_id: str) -> str:
    """Append a text paragraph to the end of a Lexical document.

    This tool adds a new paragraph block at the end of the specified document.
    It's the most common way to add content to a document and is equivalent to
    inserting at the last position. The document uses Loro's collaborative editing
    backend, ensuring real-time synchronization across all connected clients.

    IMPORTANT: You MUST provide a doc_id parameter to specify which document to modify.
    There is no default or current document - every operation requires an explicit doc_id.

    Args:
        text: The text content of the paragraph to append. Supports any UTF-8 text
              including emojis, special characters, formatted content, and multi-line
              text. Empty strings are allowed and will create an empty paragraph block.
        doc_id: The unique identifier of the document (REQUIRED). You cannot omit this
               parameter - every call must specify which document to operate on.

    Returns:
        str: JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier where content was appended
            - action: "append_paragraph" for operation tracking
            - text: The text content that was appended
            - total_blocks: Updated total number of blocks in the document after append
            - On error: success=False with error message and context information

    Example Usage:
        Simple append: append_paragraph("This is my conclusion.", "my-doc")
        With emoji: append_paragraph("Final thoughts 🎉", "report-2024")
        Empty paragraph: append_paragraph("", "my-doc")
    """
    logger.info(f"🚀🚀🚀 append_paragraph FUNCTION CALLED with text='{text}', doc_id='{doc_id}'")
    try:
        logger.info(f"Appending paragraph to document {doc_id}")
        
        # Use the collaborative document manager's handle_message system
        # This will trigger WebSocket broadcasts to other clients
        message_data = {
            "message": text,  # Use "message" field as expected by LexicalModel
            "position": "end"  # append at the end
        }
        
        # Call through the message handling system to trigger collaborative sync
        result = await document_manager.handle_message(doc_id, "append-paragraph", message_data)
        
        if not result.get("success"):
            raise Exception(f"Failed to append paragraph: {result.get('error', 'Unknown error')}")
        
        # Note: Broadcasting is handled automatically by the document manager's 
        # subscription system when in client mode. The WebSocket client receives
        # and processes changes through the normal collaborative flow.
        
        # Get updated document structure for response
        model = document_manager.get_or_create_document(doc_id)
        lexical_data = model.get_lexical_data()
        total_blocks = len(lexical_data.get("root", {}).get("children", []))
        
        response_result = {
            "success": True,
            "doc_id": doc_id,
            "action": "append_paragraph",
            "text": text,
            "total_blocks": total_blocks
        }
        
        logger.info(f"Successfully appended paragraph to document {doc_id}")
        return json.dumps(response_result, indent=2)
        
    except Exception as e:
        logger.error(f"Error appending paragraph to document {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id,
            "action": "append_paragraph"
        }
        return json.dumps(error_result, indent=2)


###############################################################################
# Click Commands


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
    help="The port to use for the Streamable HTTP transport. Ignored for stdio transport.",
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
    log_level: str,
):
    """Start the Lexical Loro MCP server with a transport."""
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize document manager with the provided websocket base URL
    # Each document will have its own WebSocket connection: {base_url}/{doc_id}
    sync_initialize_mcp_collaboration(websocket_url)
    
    logger.info(f"Starting Lexical Loro MCP Server with transport: {transport}")
    logger.info(f"WebSocket base URL: {websocket_url}")
    
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport == "streamable-http":
        logger.info(f"Starting server on {host}:{port}")
        uvicorn.run(mcp.streamable_http_app, host=host, port=port)
    else:
        raise ValueError("Transport should be 'stdio' or 'streamable-http'.")


###############################################################################
# Lexical MCP Server Class


class LexicalMCPServer:
    """Lexical MCP Server with configurable document manager.
    
    This class provides a programmatic interface to the Lexical MCP Server
    with support for custom document managers that extend LexicalDocumentManager.
    """
    
    def __init__(self, custom_document_manager: Optional[LexicalDocumentManager] = None):
        """Initialize the Lexical MCP Server.
        
        Args:
            custom_document_manager: Optional custom document manager that extends
                                   LexicalDocumentManager. If not provided, uses
                                   the default LexicalDocumentManager instance.
        """
        self.server = mcp
        
        if custom_document_manager is not None:
            set_document_manager(custom_document_manager)
        
        self.document_manager = get_document_manager()
        
        # Legacy method mapping for tests and backward compatibility
        self._load_document = self._wrap_legacy_tool(load_document)
        self._insert_paragraph = self._wrap_legacy_tool(insert_paragraph)
        self._append_paragraph = self._wrap_legacy_tool(append_paragraph)
        self._get_document_info = self._wrap_legacy_tool(get_document_info)
    
    def _wrap_legacy_tool(self, tool_func):
        """Wrap new tool functions for legacy interface compatibility"""
        from mcp.types import TextContent
        
        async def wrapper(arguments: Dict[str, Any]):
            try:
                result_str = await tool_func(**arguments)
                result_dict = json.loads(result_str)
                
                # Return in the format expected by old tests
                return [TextContent(type="text", text=result_str)]
            except Exception as e:
                error_result = {"success": False, "error": str(e)}
                return [TextContent(type="text", text=json.dumps(error_result))]
        return wrapper
    
    async def run(self):
        """Run the MCP server using stdio transport"""
        await mcp.run(transport="stdio")


###############################################################################
# Main entry points


def main():
    """Synchronous wrapper for the main function for script entry points"""
    # Use the FastMCP CLI instead of asyncio.run to avoid event loop conflicts
    server()


if __name__ == "__main__":
    server()
