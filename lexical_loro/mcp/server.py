# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional
import websockets

import click
import uvicorn
from mcp.server import FastMCP
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware

from ..model.lexical_model import LexicalDocumentManager


###############################################################################


logger = logging.getLogger(__name__)


###############################################################################
# WebSocket Client for MCP Server

class MCPWebSocketClient:
    """WebSocket client for MCP server to connect to collaborative server"""
    
    def __init__(self, websocket_url: str = "ws://localhost:8081"):
        self.websocket_url = websocket_url
        self.websocket = None
        self.client_id = None
        self.connected = False
        
    async def connect(self):
        """Connect to the WebSocket server"""
        try:
            self.websocket = await websockets.connect(self.websocket_url)
            self.connected = True
            logger.info(f"🔌 MCP WebSocket client connected to {self.websocket_url}")
            
            # Start listening for messages
            asyncio.create_task(self._listen_for_messages())
            
            # Skip awareness for now - let's see if client is detected just by connection
            # await self._send_initial_awareness()
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to WebSocket server: {e}")
            self.connected = False
    
    async def disconnect(self):
        """Disconnect from the WebSocket server"""
        if self.websocket:
            await self.websocket.close()
            self.connected = False
            logger.info("🔌 MCP WebSocket client disconnected")
    
    async def send_message(self, message: Dict[str, Any]):
        """Send a message to the WebSocket server"""
        if self.websocket and self.connected:
            try:
                await self.websocket.send(json.dumps(message))
                logger.debug(f"📤 MCP sent: {message}")
            except Exception as e:
                logger.error(f"❌ Failed to send message: {e}")
    
    async def _listen_for_messages(self):
        """Listen for messages from the WebSocket server"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                
                # Handle different message types
                if data.get("type") == "connection-established":
                    self.client_id = data.get("clientId")
                    logger.info(f"✅ MCP client established with ID: {self.client_id}")
                
                elif data.get("type") == "initial-snapshot":
                    # Handle snapshot response from WebSocket server
                    await self._handle_initial_snapshot(data)
                
                elif data.get("type") == "loro-update":
                    # Handle incremental updates from other clients
                    await self._handle_loro_update(data)
                
                elif data.get("type") == "document-update":
                    # Handle document updates from other clients
                    await self._handle_document_update(data)
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info("🔌 MCP WebSocket connection closed")
            self.connected = False
        except Exception as e:
            logger.error(f"❌ MCP WebSocket error: {e}")
            self.connected = False
    
    async def _send_initial_awareness(self):
        """Send initial awareness to make this client visible to others"""
        try:
            # Send awareness for the current document if one is set
            if current_document_id:
                # Create a simple cursor position update with minimal data
                awareness_message = {
                    "type": "ephemeral-update",
                    "docId": current_document_id,
                    "data": ""  # Empty ephemeral data, just to register the client
                }
                await self.send_message(awareness_message)
                logger.info(f"👁️ MCP client sent initial awareness for {current_document_id}")
            else:
                logger.debug("👁️ No current document set, skipping awareness")
        except Exception as e:
            logger.error(f"❌ Failed to send initial awareness: {e}")
    
    async def _handle_initial_snapshot(self, data: Dict[str, Any]):
        """Handle initial snapshot received from WebSocket server"""
        global document_manager  # Must be at the top of the function
        try:
            doc_id = data.get("docId")
            snapshot_data = data.get("data") or data.get("snapshot")  # Try both field names
            
            if doc_id and snapshot_data:
                logger.info(f"📄 MCP received initial snapshot for {doc_id}")
                
                # If snapshot_data is a binary array, we need to convert it to the format expected by LexicalModel
                if isinstance(snapshot_data, list) and all(isinstance(x, int) for x in snapshot_data):
                    # This is a Loro binary snapshot, convert to bytes and then import it
                    logger.info(f"📄 Processing binary snapshot for {doc_id}")
                    binary_data = bytes(snapshot_data)
                    
                    # Get or create the model from document manager to preserve any existing state
                    if document_manager:
                        model = document_manager.get_or_create_document(doc_id)
                        # Import the binary snapshot into the existing model
                        model.import_snapshot(binary_data)
                        logger.info(f"📄 Successfully imported binary snapshot for {doc_id}")
                    else:
                        logger.error(f"❌ No document manager available for {doc_id}")
                else:
                    # Process snapshots for any document (JSON format)
                    if document_manager:
                        document_manager.apply_snapshot(doc_id, snapshot_data)
                    else:
                        logger.error(f"❌ No document manager available for {doc_id}")
            else:
                logger.warning(f"Invalid snapshot data received for {doc_id} - doc_id: {bool(doc_id)}, snapshot_data: {bool(snapshot_data)}")
                
        except Exception as e:
            logger.error(f"❌ Error handling initial snapshot: {e}")
            logger.exception("Full exception details:")

    async def _handle_document_update(self, data: Dict[str, Any]):
        """Handle document updates received from WebSocket"""
        # This will be called when other clients make changes
        # The document manager will automatically sync via Loro CRDT
        logger.debug(f"📄 MCP received document update: {data}")
    
    async def _handle_loro_update(self, data: Dict[str, Any]):
        """Handle incremental Loro updates from other clients"""
        try:
            doc_id = data.get("docId")
            update_data = data.get("update")
            
            if not doc_id or not update_data:
                logger.warning(f"⚠️ MCP received incomplete loro-update: {data}")
                return
            
            logger.info(f"📄 MCP applying loro-update for {doc_id}")
            
            # Get the document manager to apply the update
            global document_manager
            if document_manager and doc_id in document_manager.models:
                model = document_manager.models[doc_id]
                
                # Convert update data back to bytes
                update_bytes = bytes(update_data)
                
                # Apply the incremental update to keep the model in sync
                # Use the correct Loro method to import updates (import_ to avoid Python keyword)
                model.text_doc.import_(update_bytes)
                
                # Sync the model from the updated Loro document
                model._sync_from_loro()
                
                logger.info(f"✅ MCP successfully applied loro-update for {doc_id}")
            else:
                logger.warning(f"⚠️ MCP cannot apply update - no model found for {doc_id}")
                
        except Exception as e:
            logger.error(f"❌ MCP error handling loro-update: {e}")
            logger.exception("Full exception:")

# Global WebSocket client instance
mcp_websocket_client: Optional[MCPWebSocketClient] = None


class MCPCollaborativeDocumentManager(LexicalDocumentManager):
    """Document manager that collaborates via WebSocket"""
    
    def __init__(self, websocket_client: MCPWebSocketClient, **kwargs):
        super().__init__(**kwargs)
        self.websocket_client = websocket_client
    
    def apply_snapshot(self, doc_id: str, snapshot_data: Dict[str, Any]):
        """Apply snapshot data received from WebSocket server"""
        try:
            logger.info(f"📄 Attempting to apply snapshot for {doc_id}")
            logger.debug(f"📄 Snapshot data type: {type(snapshot_data)}")
            logger.debug(f"📄 Snapshot data keys: {list(snapshot_data.keys()) if isinstance(snapshot_data, dict) else 'not a dict'}")
            
            # Create model from snapshot data instead of default
            from lexical_loro.model.lexical_model import LexicalModel
            
            # The snapshot_data is already a dict, convert to JSON string for from_json method
            json_data = json.dumps(snapshot_data)
            
            logger.debug(f"📄 JSON data length: {len(json_data)}")
            
            # Use the class method to create model from JSON
            model = LexicalModel.from_json(json_data, container_id=doc_id)
            
            # Store the model
            self.models[doc_id] = model
            logger.info(f"📄 Successfully applied snapshot for {doc_id} from WebSocket server")
                
        except Exception as e:
            logger.error(f"❌ Error applying snapshot for {doc_id}: {e}")
            logger.error(f"❌ Snapshot data: {snapshot_data}")
            logger.exception("Full exception:")
            # Fall back to parent implementation if snapshot application fails
            super().get_or_create_document(doc_id)
        
    async def ensure_websocket_connection(self):
        """Ensure WebSocket connection is established"""
        if not self.websocket_client.connected:
            await self.websocket_client.connect()
    
    def get_or_create_document(self, doc_id: str, initial_content: Optional[str] = None):
        """Override to ensure WebSocket connection and request document sync"""
        # If this is the first time accessing this document, sync first
        if doc_id not in self.models:
            # Request snapshot from WebSocket server but don't create document yet
            asyncio.create_task(self._sync_document_via_websocket(doc_id))
        
        # Call parent implementation only if we already have the document or after sync
        return super().get_or_create_document(doc_id, initial_content)
    
    async def _sync_document_via_websocket(self, doc_id: str):
        """Sync document with WebSocket server"""
        await self.ensure_websocket_connection()
        
        if self.websocket_client.connected:
            # Request snapshot from the collaborative server
            await self.websocket_client.send_message({
                "type": "request-snapshot",
                "docId": doc_id
            })
            logger.info(f"📄 MCP requested snapshot for document: {doc_id}")
            
            # Skip awareness for now - focus on getting collaborative editing working
            # await self._send_awareness_for_document(doc_id)
    
    async def _send_awareness_for_document(self, doc_id: str):
        """Send awareness update for a specific document"""
        try:
            # Send a simple ephemeral update to register MCP client for this document
            awareness_message = {
                "type": "ephemeral-update", 
                "docId": doc_id,
                "data": ""  # Empty ephemeral data, just to register the client
            }
            await self.websocket_client.send_message(awareness_message)
            logger.info(f"👁️ MCP client sent awareness for document: {doc_id} (empty)")
        except Exception as e:
            logger.error(f"❌ Failed to send awareness for {doc_id}: {e}")
    
    def handle_message(self, doc_id: str, message_type: str, data: Dict[str, Any], client_id: str = None):
        """Override to send updates via WebSocket"""
        # Call parent implementation first
        result = super().handle_message(doc_id, message_type, data, client_id)
        
        # Debug: Log all message types
        logger.info(f"🔍 MCP handle_message: type={message_type}, success={result.get('success')}, connected={self.websocket_client.connected}")
        
        # Send update to WebSocket server
        if self.websocket_client.connected and message_type in ["append-paragraph", "insert-paragraph"]:
            logger.info(f"📤 MCP will broadcast {message_type} update")
            asyncio.create_task(self._broadcast_update(doc_id, message_type, data, result))
        
        return result
    
    async def _broadcast_update(self, doc_id: str, message_type: str, data: Dict[str, Any], result: Dict[str, Any]):
        """Broadcast update to WebSocket server"""
        if result.get("success"):
            # After making changes, get the current document state and broadcast a loro-update
            try:
                model = self.get_or_create_document(doc_id)
                # Get the current Loro binary data using the model's get_snapshot method
                loro_binary = model.get_snapshot()
                
                # Send a loro-update message to trigger collaborative sync
                await self.websocket_client.send_message({
                    "type": "loro-update",
                    "docId": doc_id,
                    "update": list(loro_binary),  # Convert binary to list of bytes
                    "clientId": self.websocket_client.client_id or "mcp-client"
                })
                logger.info(f"📤 MCP broadcasted loro-update for {doc_id} ({len(loro_binary)} bytes)")
            except Exception as e:
                logger.error(f"❌ Error broadcasting MCP update: {e}")


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

# Initialize WebSocket client and collaborative document manager
def initialize_mcp_collaboration(websocket_url: str = "ws://localhost:8081"):
    """Initialize MCP server with WebSocket collaboration"""
    global mcp_websocket_client, document_manager
    
    # Create WebSocket client
    mcp_websocket_client = MCPWebSocketClient(websocket_url)
    
    # Create collaborative document manager
    document_manager = MCPCollaborativeDocumentManager(
        websocket_client=mcp_websocket_client,
        event_callback=None,  # We'll handle events via WebSocket
        ephemeral_timeout=300000
    )
    
    logger.info(f"🚀 MCP collaboration initialized with WebSocket: {websocket_url}")

# Initialize with default settings (can be overridden)
initialize_mcp_collaboration()

# Current document state
current_document_id: Optional[str] = None


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
# Tools using FastMCP decorators


@mcp.tool()
async def load_document(doc_id: str) -> str:
    """Load a Lexical document by document ID and retrieve its complete structure.

    This tool loads an existing document or creates a new one if it doesn't exist.
    The document uses Loro's collaborative editing backend for real-time synchronization.
    Returns the complete lexical data structure including all blocks, metadata, and
    container information for collaborative editing.

    Args:
        doc_id: The unique identifier of the document to load. Can be any string
               that serves as a document identifier (e.g., "my-doc", "report-2024").
               Documents are automatically created if they don't exist.

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
async def insert_paragraph(index: int, text: str, doc_id: Optional[str] = None) -> str:
    """Insert a text paragraph at a specific position in a Lexical document.

    This tool inserts a new paragraph block at the specified index position within
    the document. All existing blocks at or after the specified index will be shifted
    down by one position. The document uses Loro's collaborative editing backend,
    so changes are automatically synchronized across all connected clients.

    Args:
        index: The zero-based index position where to insert the paragraph.
               Use 0 to insert at the beginning, or any valid index within the document.
               If index exceeds document length, paragraph is appended at the end.
        text: The text content of the paragraph to insert. Can contain any UTF-8 text
              including emojis, special characters, and multi-line content.
        doc_id: The unique identifier of the document (optional). If not provided,
                uses the current document set via set_current_document. Explicit doc_id
                takes precedence over current document.

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
        Insert at beginning: insert_paragraph(0, "Introduction paragraph")
        Insert with explicit doc: insert_paragraph(2, "Middle content", "my-doc")
        Insert using current doc: insert_paragraph(1, "Second paragraph")
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
    """Append a text paragraph to the end of a Lexical document.

    This tool adds a new paragraph block at the end of the specified document.
    It's the most common way to add content to a document and is equivalent to
    inserting at the last position. The document uses Loro's collaborative editing
    backend, ensuring real-time synchronization across all connected clients.

    Args:
        text: The text content of the paragraph to append. Supports any UTF-8 text
              including emojis, special characters, formatted content, and multi-line
              text. Empty strings are allowed and will create an empty paragraph block.
        doc_id: The unique identifier of the document (optional). If not provided,
                uses the current document set via set_current_document. Explicit doc_id
                takes precedence over current document setting.

    Returns:
        str: JSON string containing:
            - success: Boolean indicating operation success
            - doc_id: The document identifier where content was appended
            - action: "append_paragraph" for operation tracking
            - text: The text content that was appended
            - total_blocks: Updated total number of blocks in the document after append
            - On error: success=False with error message and context information

    Example Usage:
        Simple append: append_paragraph("This is my conclusion.")
        With explicit doc: append_paragraph("Final thoughts", "report-2024")
        Using current doc: append_paragraph("Additional notes")
        Empty paragraph: append_paragraph("")
    """
    global current_document_id
    try:
        # Determine which document to use
        target_doc_id = doc_id if doc_id is not None else current_document_id
        
        if target_doc_id is None:
            raise ValueError("No document ID provided and no current document set. Use set_current_document first or provide doc_id.")
        
        logger.info(f"Appending paragraph to document {target_doc_id}")
        
        # Use the collaborative document manager's handle_message system
        # This will trigger WebSocket broadcasts to other clients
        message_data = {
            "message": text,  # Use "message" field as expected by LexicalModel
            "position": "end"  # append at the end
        }
        
        # Call through the message handling system to trigger collaborative sync
        result = document_manager.handle_message(target_doc_id, "append-paragraph", message_data)
        
        if not result.get("success"):
            raise Exception(f"Failed to append paragraph: {result.get('error', 'Unknown error')}")
        
        # Get updated document structure for response
        model = document_manager.get_or_create_document(target_doc_id)
        lexical_data = model.get_lexical_data()
        total_blocks = len(lexical_data.get("root", {}).get("children", []))
        
        response_result = {
            "success": True,
            "doc_id": target_doc_id,
            "action": "append_paragraph",
            "text": text,
            "total_blocks": total_blocks
        }
        
        logger.info(f"Successfully appended paragraph to document {target_doc_id}")
        return json.dumps(response_result, indent=2)
        
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
    """Retrieve comprehensive information and metadata about a Lexical document.

    This tool provides detailed information about a document's structure, content,
    and metadata without returning the full document content. It's useful for
    understanding document composition, tracking changes, and getting quick insights
    about document statistics before performing operations.

    Args:
        doc_id: The unique identifier of the document to inspect (optional).
                If not provided, uses the current document set via set_current_document.
                Explicit doc_id takes precedence over current document setting.

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
        Check current doc: get_document_info()
        Check specific doc: get_document_info("project-notes")
        Inspect before editing: get_document_info("draft-2024")

    Use Cases:
        - Document structure analysis before bulk operations
        - Content auditing and statistics
        - Version tracking and change monitoring
        - Debugging document state issues
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
    """Set the current document for subsequent operations that support optional doc_id.

    This tool establishes a "working document" context that allows other tools
    (append_paragraph, insert_paragraph, get_document_info) to operate without
    explicitly specifying a doc_id parameter. This creates a more fluid workflow
    when working primarily with a single document. The document is automatically
    created if it doesn't exist.

    Args:
        doc_id: The unique identifier of the document to set as current working document.
                Can be any string identifier. Document will be created if it doesn't exist.
                Examples: "my-notes", "project-2024", "draft-document"

    Returns:
        str: JSON string containing:
            - success: Boolean indicating operation success
            - message: Confirmation message about the current document setting
            - doc_id: The document identifier that was set as current
            - container_id: Loro container ID for the document
            - On error: success=False with error message and doc_id

    Example Usage:
        Set working doc: set_current_document("project-notes")
        Create new context: set_current_document("new-draft-2024")
        Switch documents: set_current_document("meeting-minutes")

    Workflow Benefits:
        1. Set current document once: set_current_document("my-doc")
        2. Work without doc_id: append_paragraph("First point")
        3. Continue seamlessly: insert_paragraph(0, "Introduction")
        4. Check status easily: get_document_info()

    Note: The load_document tool always requires an explicit doc_id parameter
    and is not affected by the current document setting.
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


def main():
    """Synchronous wrapper for the main function for script entry points"""
    # Use the FastMCP CLI instead of asyncio.run to avoid event loop conflicts
    server()


if __name__ == "__main__":
    server()
