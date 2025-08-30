# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

import click
import uvicorn
from mcp.server import FastMCP
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from ..model.lexical_model import LexicalDocumentManager


###############################################################################


logger = logging.getLogger(__name__)


###############################################################################


class FastMCPWithCORS(FastMCP):
    def streamable_http_app(self) -> Starlette:
        """Return StreamableHTTP server app with CORS middleware"""
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


###############################################################################


# Create the FastMCP server
mcp = FastMCP("Lexical MCP Server")

# Initialize document manager
document_manager = LexicalDocumentManager()

# Current document state
current_document_id: Optional[str] = None


###############################################################################
# Tools using FastMCP decorators


@mcp.tool()
async def load_document(doc_id: str) -> str:
    """Load a document by document ID.

    Args:
        doc_id: The unique identifier of the document to load

    Returns:
        str: JSON string containing the document data or error information
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
async def insert_paragraph(index: int, text: str, doc_id: Optional[str] = None) -> str:
    """Insert a text paragraph at a specific index in a document.

    Args:
        index: The index position where to insert the paragraph (0-based)
        text: The text content of the paragraph to insert
        doc_id: The unique identifier of the document (optional, uses current document if not provided)

    Returns:
        str: JSON string containing the operation result
    """
    global current_document_id
    try:
        # Determine which document to use
        target_doc_id = doc_id if doc_id is not None else current_document_id
        
        if target_doc_id is None:
            raise ValueError("No document ID provided and no current document set. Use set_current_document first or provide doc_id.")
        
        logger.info(f"Inserting paragraph in document {target_doc_id} at index {index}")
        
        # Get or create the document
        model = document_manager.get_or_create_document(target_doc_id)
        
        # Create paragraph structure
        block_detail = {"text": text}
        
        # Insert the paragraph at the specified index
        model.add_block_at_index(index, block_detail, "paragraph")
        
        # Get updated document structure
        lexical_data = model.get_lexical_data()
        total_blocks = len(lexical_data.get("root", {}).get("children", []))
        
        result = {
            "success": True,
            "doc_id": target_doc_id,
            "action": "insert_paragraph",
            "index": index,
            "text": text,
            "total_blocks": total_blocks
        }
        
        logger.info(f"Successfully inserted paragraph in document {target_doc_id} at index {index}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        target_doc_id_for_error = target_doc_id if 'target_doc_id' in locals() else (doc_id or "unknown")
        logger.error(f"Error inserting paragraph in document {target_doc_id_for_error}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": target_doc_id_for_error,
            "action": "insert_paragraph"
        }
        return json.dumps(error_result, indent=2)


@mcp.tool()
async def append_paragraph(text: str, doc_id: Optional[str] = None) -> str:
    """Append a text paragraph at the end of a document.

    Args:
        text: The text content of the paragraph to append
        doc_id: The unique identifier of the document (optional, uses current document if not provided)

    Returns:
        str: JSON string containing the operation result
    """
    global current_document_id
    try:
        # Determine which document to use
        target_doc_id = doc_id if doc_id is not None else current_document_id
        
        if target_doc_id is None:
            raise ValueError("No document ID provided and no current document set. Use set_current_document first or provide doc_id.")
        
        logger.info(f"Appending paragraph to document {target_doc_id}")
        
        # Get or create the document
        model = document_manager.get_or_create_document(target_doc_id)
        
        # Create paragraph structure
        block_detail = {"text": text}
        
        # Append the paragraph using add_block (adds at the end)
        model.add_block(block_detail, "paragraph")
        
        # Get updated document structure
        lexical_data = model.get_lexical_data()
        total_blocks = len(lexical_data.get("root", {}).get("children", []))
        
        result = {
            "success": True,
            "doc_id": target_doc_id,
            "action": "append_paragraph",
            "text": text,
            "total_blocks": total_blocks
        }
        
        logger.info(f"Successfully appended paragraph to document {target_doc_id}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        target_doc_id_for_error = target_doc_id if 'target_doc_id' in locals() else (doc_id or "unknown")
        logger.error(f"Error appending paragraph to document {target_doc_id_for_error}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": target_doc_id_for_error,
            "action": "append_paragraph"
        }
        return json.dumps(error_result, indent=2)


@mcp.tool()
async def get_document_info(doc_id: Optional[str] = None) -> str:
    """Get basic information about a document.

    Args:
        doc_id: The unique identifier of the document (optional, uses current document if not provided)

    Returns:
        str: JSON string containing document information
    """
    global current_document_id
    try:
        # Determine which document to use
        target_doc_id = doc_id if doc_id is not None else current_document_id
        
        if target_doc_id is None:
            raise ValueError("No document ID provided and no current document set. Use set_current_document first or provide doc_id.")
        
        logger.info(f"Getting document info for: {target_doc_id}")
        
        # Get or create the document
        model = document_manager.get_or_create_document(target_doc_id)
        
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
            "doc_id": target_doc_id,
            "container_id": model.container_id,
            "total_blocks": len(children),
            "block_types": block_types,
            "last_saved": lexical_data.get("lastSaved"),
            "version": lexical_data.get("version"),
            "source": lexical_data.get("source")
        }
        
        logger.info(f"Successfully retrieved document info for {target_doc_id}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        target_doc_id_for_error = target_doc_id if 'target_doc_id' in locals() else (doc_id or "unknown")
        logger.error(f"Error getting document info for {target_doc_id_for_error}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": target_doc_id_for_error
        }
        return json.dumps(error_result, indent=2)


@mcp.tool()
async def set_current_document(doc_id: str) -> str:
    """Set the current document for subsequent operations.

    Args:
        doc_id: The unique identifier of the document to set as current

    Returns:
        str: JSON string confirming the current document has been set
    """
    global current_document_id
    try:
        logger.info(f"Setting current document to: {doc_id}")
        
        # Validate that the document exists or can be created
        model = document_manager.get_or_create_document(doc_id)
        
        # Set the current document
        current_document_id = doc_id
        
        result = {
            "success": True,
            "message": f"Current document set to: {doc_id}",
            "doc_id": doc_id,
            "container_id": model.container_id
        }
        
        logger.info(f"Successfully set current document to {doc_id}")
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error setting current document to {doc_id}: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "doc_id": doc_id
        }
        return json.dumps(error_result, indent=2)


###############################################################################
# Commands using Click


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
    log_level: str,
):
    """Start the Lexical Loro MCP server with a transport."""
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    logger.info(f"Starting Lexical Loro MCP Server with transport: {transport}")
    
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport == "streamable-http":
        logger.info(f"Starting server on {host}:{port}")
        uvicorn.run(mcp.streamable_http_app, host=host, port=port)
    else:
        raise ValueError("Transport should be 'stdio' or 'streamable-http'.")


###############################################################################
# Legacy class-based interface for backward compatibility


class LexicalMCPServer:
    """Legacy MCP Server class for backward compatibility"""
    
    def __init__(self):
        self.server = mcp
        self.document_manager = document_manager
        
        # Legacy method mapping for tests
        self._load_document = self._wrap_legacy_tool(load_document)
        self._insert_paragraph = self._wrap_legacy_tool(insert_paragraph)
        self._append_paragraph = self._wrap_legacy_tool(append_paragraph)
        self._get_document_info = self._wrap_legacy_tool(get_document_info)
        self._set_current_document = self._wrap_legacy_tool(set_current_document)
    
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


async def main():
    """Main entry point for the MCP server"""
    server = LexicalMCPServer()
    await server.run()


def main_sync():
    """Synchronous wrapper for the main function for script entry points"""
    # Use the FastMCP CLI instead of asyncio.run to avoid event loop conflicts
    server()


if __name__ == "__main__":
    server()
