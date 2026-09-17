# Copyright (c) 2025-2026 Datalayer, Inc.
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
from mcp.server import MCPServer
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from ..model.document_manager import TreeDocumentManager
from ..model.lexical_loro import LoroTreeModel

logger = logging.getLogger(__name__)

###############################################################################
# Global document manager instance and configuration
document_manager: Optional[TreeDocumentManager] = None
_websocket_base_url: str = "ws://localhost:8081"

###############################################################################
# MCP Server with CORS support and legacy HTTP endpoints
class MCPServerWithCORS(MCPServer):
    def streamable_http_app(
        self, *, stateless_http: bool = True, **kwargs: Any
    ) -> Starlette:
        """Return StreamableHTTP server app with CORS middleware and legacy endpoints
        See: https://github.com/modelcontextprotocol/python-sdk/issues/187

        `stateless_http` is a parameter here rather than on the constructor:
        mcp 2 moved it, and it defaults to True so this server keeps the
        stateless behaviour it asked for under mcp 1. The rest of the keyword
        arguments are forwarded untouched, so options this override has never
        heard of still reach the SDK.
        """
        # Get the original Starlette app
        app = super().streamable_http_app(stateless_http=stateless_http, **kwargs)
        
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
    
    def sse_app(self, **kwargs: Any) -> Starlette:
        """Return SSE server app with CORS middleware

        Keyword-only in mcp 2, and `mount_path` is gone — the path is now
        `sse_path`. Forwarded wholesale so a caller can still set it.
        """
        # Get the original Starlette app
        app = super().sse_app(**kwargs)
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
        """GET /tools/list — the registered tools, for a client without an MCP SDK."""
        if request.method == "OPTIONS":
            return _cors_preflight()
        tools = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.input_schema,
            }
            for tool in await self.list_tools()
        ]
        return JSONResponse(content={"tools": tools}, headers=_CORS_HEADERS)

    async def legacy_json_rpc(self, request: Request) -> JSONResponse:
        """POST / — JSON-RPC for a client without an MCP SDK.

        Takes the MCP shapes (`tools/list`, `tools/call` with `name` and
        `arguments`) and the older one where `method` is the tool's name and
        `params` its arguments. Any registered tool is reachable; nothing is
        listed by hand here.
        """
        if request.method == "OPTIONS":
            return _cors_preflight()
        request_id = None
        try:
            body = await request.json()
            request_id = body.get("id")
            method = body.get("method")
            params = body.get("params") or {}
            if method == "tools/list":
                tools = [
                    {"name": t.name, "description": t.description, "input_schema": t.input_schema}
                    for t in await self.list_tools()
                ]
                return JSONResponse(
                    content={"jsonrpc": "2.0", "result": {"tools": tools}, "id": request_id},
                    headers=_CORS_HEADERS,
                )
            if method == "tools/call":
                name = params.get("name")
                arguments = params.get("arguments") or {}
            else:
                name = method
                arguments = params
            known = {t.name for t in await self.list_tools()}
            if name not in known:
                return JSONResponse(
                    content={"jsonrpc": "2.0", "error": {"code": -32601, "message": f"Method not found: {name}"}, "id": request_id},
                    headers=_CORS_HEADERS,
                )
            outcome = await self.call_tool(name, arguments)
            result = _call_result_to_json(outcome)
            return JSONResponse(
                content={"jsonrpc": "2.0", "result": result, "id": request_id},
                headers=_CORS_HEADERS,
            )
        except Exception as e:
            logger.error(f"Error in legacy JSON-RPC handler: {e}")
            return JSONResponse(
                content={"jsonrpc": "2.0", "error": {"code": -32603, "message": str(e)}, "id": request_id},
                headers=_CORS_HEADERS,
                status_code=500,
            )


_CORS_HEADERS = {"Access-Control-Allow-Origin": "*"}


def _cors_preflight() -> JSONResponse:
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


def _call_result_to_json(outcome: Any) -> Any:
    """The JSON a tool returned, out of the MCP call result that wraps it.

    The tools answer a JSON string; the SDK carries it as text content and,
    for a string return, as structured content `{"result": "<the string>"}`.
    The text is the answer.
    """
    for item in getattr(outcome, "content", None) or []:
        text = getattr(item, "text", None)
        if text is None:
            continue
        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return text
    structured = getattr(outcome, "structured_content", None)
    if isinstance(structured, dict) and set(structured) == {"result"}:
        return structured["result"]
    return structured


# Create MCP server instance
mcp = MCPServerWithCORS("lexical-loro")

###############################################################################
# Document Manager Initialization

async def get_or_create_document_manager() -> TreeDocumentManager:
    """Get or create the global document manager instance"""
    global document_manager, _websocket_base_url
    
    if document_manager is None:
        logger.debug("MCP server: Creating TreeDocumentManager...")
        document_manager = TreeDocumentManager(
            base_path="./documents",
            websocket_url=_websocket_base_url,
            auto_save_interval=30,
            max_cached_documents=50
        )
        
        # Start background tasks in async context
        await document_manager.start_background_tasks_async()
        
        logger.debug("MCP server: TreeDocumentManager created")
    
    return document_manager

# Helper function for ensuring document synchronization
async def _ensure_document_synced(doc_id: str):
    """Ensure document is properly synchronized with WebSocket server before reading"""
    logger.debug(f"MCP server: Ensuring document sync for {doc_id}")
    model = document_manager.get_document(doc_id)
    if not model:
        logger.debug(f"MCP server: Document {doc_id} not found, creating empty document for WebSocket sync")
        model = document_manager.create_document_for_websocket_sync(doc_id)
    
    # Ensure WebSocket connection for collaborative sync
    await _ensure_websocket_connection(model)
    
    # Wait a moment for synchronization
    await asyncio.sleep(0.5)
    logger.debug(
        f"MCP server: Document sync complete for {doc_id} "
        f"(connected={model.websocket_connected}, initialized={model._is_initialized})"
    )
    
    return model

###############################################################################
# Blocks
#
# A tool writes straight into the Loro tree: a block is a tree node whose
# `lexical` data is the block's serialized Lexical node without its children,
# and whose children are tree nodes of their own. That is what the editors put
# there and what they read back, so a block written here appears in every pane
# the moment the relay passes it on.


def _root_id(model: LoroTreeModel):
    for node in model.tree.get_nodes(False):
        if node.parent is None:
            return node.id
    raise ValueError("Cannot find root node in document tree")


def _root_children(model: LoroTreeModel) -> list:
    children = model.tree.children(_root_id(model))
    return list(children) if children else []


def _text_node(text: str) -> Dict[str, Any]:
    return {
        "type": "text",
        "text": text,
        "format": 0,
        "style": "",
        "mode": "normal",
        "detail": 0,
        "version": 1,
    }


def _element(kind: str, text: str, **extra: Any) -> Dict[str, Any]:
    block = {
        "type": kind,
        "format": "",
        "indent": 0,
        "direction": None,
        "version": 1,
        "children": [_text_node(text)] if text else [],
    }
    block.update(extra)
    return block


def _paragraph(text: str) -> Dict[str, Any]:
    return _element("paragraph", text, textFormat=0, textStyle="")


def _heading(text: str, level: int) -> Dict[str, Any]:
    level = min(max(int(level), 1), 6)
    return _element("heading", text, tag=f"h{level}")


def _quote(text: str) -> Dict[str, Any]:
    return _element("quote", text)


def _code(code: str, language: str) -> Dict[str, Any]:
    return _element("code", code, language=language)


def _jupyter_cell(code: str, language: str) -> list:
    """A Jupyter cell is two blocks: the input, and the output that follows it."""
    import uuid as _uuid

    input_uuid = str(_uuid.uuid4())
    output_uuid = str(_uuid.uuid4())
    cell_input = _element("jupyter-input", code, language=language, jupyterInputNodeUuid=input_uuid)
    cell_output = {
        "type": "jupyter-output",
        "source": code,
        "outputs": [],
        "jupyterInputNodeUuid": input_uuid,
        "jupyterOutputNodeUuid": output_uuid,
        "version": 1,
    }
    return [cell_input, cell_output]


_DECORATORS = {"jupyter-output", "image", "excalidraw", "horizontalrule", "youtube", "equation"}


def _element_type(block: Dict[str, Any]) -> str:
    kind = block.get("type", "")
    if kind == "text":
        return "text"
    if kind == "linebreak":
        return "linebreak"
    if kind in _DECORATORS:
        return "decorator"
    return kind


def _write_node(model: LoroTreeModel, node_id, block: Dict[str, Any]) -> None:
    data = {k: v for k, v in block.items() if k != "children"}
    meta = model.tree.get_meta(node_id)
    meta.insert("elementType", _element_type(block))
    meta.insert("lexical", data)
    for i, child in enumerate(block.get("children") or []):
        child_id = model.tree.create_at(i, node_id)
        _write_node(model, child_id, child)


def _create_block(model: LoroTreeModel, index: int, block: Dict[str, Any]):
    """Create a block under the root; a negative or oversized index appends."""
    if "type" not in block:
        raise ValueError("A block needs a 'type'")
    root = _root_id(model)
    count = len(_root_children(model))
    at = count if index is None or index < 0 or index > count else index
    node_id = model.tree.create_at(at, root)
    _write_node(model, node_id, block)
    return node_id, at


def _block_at(model: LoroTreeModel, index: int):
    children = _root_children(model)
    if index < 0 or index >= len(children):
        raise IndexError(f"No block at index {index}; the document has {len(children)}")
    return children[index]


def _replace_children(model: LoroTreeModel, node_id, children: list) -> None:
    existing = model.tree.children(node_id)
    for child in list(existing) if existing else []:
        model.tree.delete(child)
    for i, child in enumerate(children):
        child_id = model.tree.create_at(i, node_id)
        _write_node(model, child_id, child)


def _commit(model: LoroTreeModel) -> None:
    model.doc.commit()


async def _open(doc_id: str, create: bool = True) -> LoroTreeModel:
    """The document, joined to its room.

    A document the manager does not hold yet is created empty and filled by
    the relay's snapshot; one that has to take a write before the snapshot is
    there gets the default content instead.
    """
    manager = await get_or_create_document_manager()
    model = manager.get_document(doc_id)
    if not model:
        model = (
            manager.create_document(doc_id)
            if create
            else manager.create_document_for_websocket_sync(doc_id)
        )
    await _ensure_websocket_connection(model)
    return model


def _ok(doc_id: str, **fields: Any) -> str:
    return json.dumps({"success": True, "doc_id": doc_id, **fields}, indent=2)


def _fail(doc_id: str, error: Exception, **fields: Any) -> str:
    logger.error(f"MCP tool failed for {doc_id}: {error}")
    return json.dumps({"success": False, "doc_id": doc_id, "error": str(error), **fields}, indent=2)


def _blocks_summary(model: LoroTreeModel) -> Dict[str, Any]:
    lexical_json = _loro_tree_to_lexical_json(model)
    children = lexical_json.get("root", {}).get("children", [])
    return {"total_blocks": len(children), "lexical_json": lexical_json}


###############################################################################
# MCP Tools


@mcp.tool()
async def list_documents() -> str:
    """List the documents this server knows: the ones saved under its documents path, and the ones open in memory with their room connection state.

    Returns:
        JSON string with `documents` (saved on disk) and `open` (in memory, with `connected`).
    """
    try:
        manager = await get_or_create_document_manager()
        saved = manager.list_documents(include_stats=False)
        open_docs = [
            {"doc_id": doc_id, "connected": bool(getattr(model, "websocket_connected", False))}
            for doc_id, model in list(getattr(manager, "_documents", {}).items())
        ]
        return json.dumps({"success": True, "documents": saved, "open": open_docs}, indent=2)
    except Exception as e:
        return _fail("", e)


@mcp.tool()
async def get_document(doc_id: str) -> str:
    """Get a document's content as Lexical JSON.

    Args:
        doc_id: The document identifier — the collaboration room's name.

    Returns:
        JSON string with `lexical_json` (the document) and `total_blocks`.
    """
    try:
        model = await _open(doc_id, create=False)
        await asyncio.sleep(0.5)
        return _ok(doc_id, **_blocks_summary(model))
    except Exception as e:
        return _fail(doc_id, e)


@mcp.tool()
async def load_document(doc_id: str) -> str:
    """Load a document by its identifier, creating it when it does not exist, and return its full Lexical structure.

    Args:
        doc_id: The document identifier — the collaboration room's name.

    Returns:
        JSON string with `lexical_data` (the document), `total_blocks` and `container_id`.
    """
    try:
        model = await _open(doc_id, create=False)
        await asyncio.sleep(0.5)
        summary = _blocks_summary(model)
        return _ok(doc_id, lexical_data=summary["lexical_json"], total_blocks=summary["total_blocks"], container_id=doc_id)
    except Exception as e:
        return _fail(doc_id, e)


@mcp.tool()
async def get_document_info(doc_id: str) -> str:
    """Describe a document: how many blocks it has, of which types, with a text preview of each — without returning the whole content.

    Args:
        doc_id: The document identifier — the collaboration room's name.

    Returns:
        JSON string with `total_blocks`, `block_types` (counts by type) and `content_preview` (one line per block).
    """
    try:
        model = await _open(doc_id, create=False)
        await asyncio.sleep(0.5)
        lexical_json = _loro_tree_to_lexical_json(model)
        children = lexical_json.get("root", {}).get("children", [])
        block_types: Dict[str, int] = {}
        preview = []
        for i, child in enumerate(children):
            kind = child.get("type", "unknown")
            block_types[kind] = block_types.get(kind, 0) + 1
            text = "".join(
                node.get("text", "") for node in child.get("children", []) if node.get("type") == "text"
            )
            preview.append(f"Block {i}: [{kind}] '{text[:100]}'" if text else f"Block {i}: [{kind}]")
        return _ok(doc_id, container_id=doc_id, total_blocks=len(children), block_types=block_types, content_preview=preview)
    except Exception as e:
        return _fail(doc_id, e)


async def _insert(doc_id: str, index: int, blocks: list, action: str, **echo: Any) -> str:
    try:
        model = await _open(doc_id)
        ids = []
        at = index
        for block in blocks:
            node_id, at = _create_block(model, at, block)
            ids.append(str(node_id))
            at += 1
        _commit(model)
        return _ok(
            doc_id,
            action=action,
            index=at - len(blocks),
            added_node_ids=ids,
            total_blocks=len(_root_children(model)),
            **echo,
        )
    except Exception as e:
        return _fail(doc_id, e, action=action)


@mcp.tool()
async def append_paragraph(doc_id: str, text: str) -> str:
    """Append a paragraph at the end of a document.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        text: The paragraph's text.

    Returns:
        JSON string with `added_node_ids` and `total_blocks`.
    """
    return await _insert(doc_id, -1, [_paragraph(text)], "append_paragraph", text=text)


@mcp.tool()
async def insert_paragraph(doc_id: str, index: int, text: str) -> str:
    """Insert a paragraph at a position in a document; the blocks from that position on move down by one.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the new block; a negative or too large index appends.
        text: The paragraph's text.

    Returns:
        JSON string with `index` (where it landed), `added_node_ids` and `total_blocks`.
    """
    return await _insert(doc_id, index, [_paragraph(text)], "insert_paragraph", text=text)


@mcp.tool()
async def insert_heading(doc_id: str, index: int, text: str, level: int = 1) -> str:
    """Insert a heading at a position in a document.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the new block; a negative or too large index appends.
        text: The heading's text.
        level: 1 to 6, for h1 to h6.

    Returns:
        JSON string with `index`, `added_node_ids` and `total_blocks`.
    """
    return await _insert(doc_id, index, [_heading(text, level)], "insert_heading", text=text, level=level)


@mcp.tool()
async def insert_quote(doc_id: str, index: int, text: str) -> str:
    """Insert a block quote at a position in a document.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the new block; a negative or too large index appends.
        text: The quote's text.

    Returns:
        JSON string with `index`, `added_node_ids` and `total_blocks`.
    """
    return await _insert(doc_id, index, [_quote(text)], "insert_quote", text=text)


@mcp.tool()
async def insert_code_block(doc_id: str, index: int, code: str, language: str = "python") -> str:
    """Insert a code block (highlighted, not executable) at a position in a document.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the new block; a negative or too large index appends.
        code: The code.
        language: The language, for highlighting.

    Returns:
        JSON string with `index`, `added_node_ids` and `total_blocks`.
    """
    return await _insert(doc_id, index, [_code(code, language)], "insert_code_block", language=language)


@mcp.tool()
async def insert_jupyter_cell(doc_id: str, index: int, code: str, language: str = "python") -> str:
    """Insert an executable Jupyter cell at a position in a document: an input block holding the code, followed by its output block.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the cell's input; a negative or too large index appends.
        code: The cell's code.
        language: The kernel language.

    Returns:
        JSON string with `index`, `added_node_ids` (input then output) and `total_blocks`.
    """
    return await _insert(doc_id, index, _jupyter_cell(code, language), "insert_jupyter_cell", language=language)


@mcp.tool()
async def insert_block(doc_id: str, index: int, block_json: str) -> str:
    """Insert any block from its serialized Lexical JSON — for node types the other tools do not cover.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the new block; a negative or too large index appends.
        block_json: The serialized Lexical node, with `type` and, for elements, `children`.

    Returns:
        JSON string with `index`, `added_node_ids` and `total_blocks`.
    """
    try:
        block = json.loads(block_json)
    except (TypeError, ValueError) as e:
        return _fail(doc_id, e, action="insert_block")
    return await _insert(doc_id, index, [block], "insert_block", type=block.get("type"))


@mcp.tool()
async def update_block_text(doc_id: str, index: int, text: str) -> str:
    """Replace the text of the block at a position — a paragraph, heading, quote, code block or cell input — keeping the block itself.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the block.
        text: The new text.

    Returns:
        JSON string with `index`, `type` (of the block) and `total_blocks`.
    """
    try:
        model = await _open(doc_id)
        node_id = _block_at(model, index)
        raw = model.tree.get_meta(node_id).get("lexical")
        data = getattr(raw, "value", raw)
        kind = data.get("type", "") if isinstance(data, dict) else ""
        if kind in _DECORATORS:
            raise ValueError(f"Block {index} is a {kind}; it has no text to replace")
        _replace_children(model, node_id, [_text_node(text)])
        _commit(model)
        return _ok(doc_id, action="update_block_text", index=index, type=kind, total_blocks=len(_root_children(model)))
    except Exception as e:
        return _fail(doc_id, e, action="update_block_text")


@mcp.tool()
async def delete_block(doc_id: str, index: int) -> str:
    """Delete the block at a position in a document.

    Args:
        doc_id: The document identifier — the collaboration room's name.
        index: Zero-based position of the block to delete.

    Returns:
        JSON string with `index` and `total_blocks` after the deletion.
    """
    try:
        model = await _open(doc_id)
        node_id = _block_at(model, index)
        model.tree.delete(node_id)
        _commit(model)
        return _ok(doc_id, action="delete_block", index=index, total_blocks=len(_root_children(model)))
    except Exception as e:
        return _fail(doc_id, e, action="delete_block")


@mcp.tool()
async def save_document(doc_id: str) -> str:
    """Save a document to this server's documents path.

    Args:
        doc_id: The document identifier — the collaboration room's name.

    Returns:
        JSON string with `saved`.
    """
    try:
        manager = await get_or_create_document_manager()
        if not manager.get_document(doc_id):
            await _open(doc_id, create=False)
        saved = manager.save_document(doc_id, force=True)
        return _ok(doc_id, action="save_document", saved=bool(saved))
    except Exception as e:
        return _fail(doc_id, e, action="save_document")


###############################################################################
# Room and export


async def _ensure_websocket_connection(model: LoroTreeModel) -> None:
    """Join the document's room, so that what is written here reaches every pane and what they write reaches here."""
    try:
        if model.websocket_connected:
            return
        await model.connect_to_websocket_server()
        await asyncio.sleep(0.5)
        if not model._is_initialized:
            logger.warning(f"MCP server: document {model.doc_id} has no snapshot yet after connecting")
    except Exception as e:
        logger.error(f"MCP server: WebSocket connection failed for doc {model.doc_id}: {e}")


_EMPTY_DOCUMENT = {
    "root": {"children": [], "direction": None, "format": "", "indent": 0, "type": "root", "version": 1}
}


def _loro_tree_to_lexical_json(model: LoroTreeModel) -> Dict[str, Any]:
    """The document as Lexical JSON; empty while the model has nothing yet."""
    try:
        if hasattr(model, "export_to_lexical_state") and model._is_initialized:
            return model.export_to_lexical_state(log_structure=False)
        logger.warning(f"Model {model.doc_id} not fully initialized, returning empty Lexical structure")
    except Exception as e:
        logger.error(f"Error converting tree to Lexical JSON: {e}")
    return json.loads(json.dumps(_EMPTY_DOCUMENT))


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
    envvar="DOCUMENTS_PATH",
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
    
    # Set global websocket URL before creating document manager
    global document_manager, _websocket_base_url
    _websocket_base_url = websocket_url
    
    # Initialize global document manager with custom path
    logger.debug("MCP server CLI: Initializing document manager...")
    document_manager = TreeDocumentManager(
        base_path=documents_path,
        websocket_url=websocket_url,
        auto_save_interval=30,
        max_cached_documents=50
    )
    logger.debug("MCP server CLI: Document manager initialized")
    
    logger.info(f"Starting Lexical Loro MCP Server with transport: {transport}")
    logger.info(f"WebSocket base URL: {websocket_url}")
    logger.info(f"Documents path: {documents_path}")
    
    if transport == "stdio":
        mcp.run(transport="stdio")
    elif transport == "streamable-http":
        logger.info(f"Starting server on {host}:{port}")
        uvicorn.run(mcp.streamable_http_app(), host=host, port=port)
    else:
        raise ValueError("Transport should be 'stdio' or 'streamable-http'.")