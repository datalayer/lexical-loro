# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the MIT License.

"""The MCP tools, exercised without a relay.

Each tool writes into a document's Loro tree and answers JSON. Here the
document manager lives in a temporary directory and joining a room is a
no-op, so what is checked is what the tools do to the document and say
about it — not the transport.
"""

import importlib
import json

import pytest
from starlette.testclient import TestClient

from lexical_loro.model.document_manager import TreeDocumentManager

server = importlib.import_module("lexical_loro.mcp.server")


@pytest.fixture
def mcp(tmp_path, monkeypatch):
    manager = TreeDocumentManager(
        base_path=str(tmp_path), websocket_url="ws://localhost:1", auto_save_interval=3600
    )
    monkeypatch.setattr(server, "document_manager", manager)

    async def no_room(model):
        return None

    monkeypatch.setattr(server, "_ensure_websocket_connection", no_room)
    yield server
    manager.shutdown()


def parse(result: str) -> dict:
    data = json.loads(result)
    assert data["success"], data
    return data


def blocks(mcp, doc_id: str) -> list:
    document = mcp._loro_tree_to_lexical_json(mcp.document_manager.get_document(doc_id))
    return document["root"]["children"]


def text_of(block: dict) -> str:
    return "".join(c.get("text", "") for c in block.get("children", []) if c.get("type") == "text")


def without_keys(node):
    """The structure without Lexical keys, which every export mints afresh."""
    if isinstance(node, dict):
        return {k: without_keys(v) for k, v in node.items() if k != "__key"}
    if isinstance(node, list):
        return [without_keys(v) for v in node]
    return node


async def test_every_tool_is_registered(mcp):
    names = {tool.name for tool in await mcp.mcp.list_tools()}
    assert names == {
        "list_documents",
        "get_document",
        "load_document",
        "get_document_info",
        "append_paragraph",
        "insert_paragraph",
        "insert_heading",
        "insert_quote",
        "insert_code_block",
        "insert_jupyter_cell",
        "insert_block",
        "update_block_text",
        "delete_block",
        "save_document",
    }


async def test_append_and_insert_paragraphs(mcp):
    parse(await mcp.append_paragraph("doc", "first"))
    parse(await mcp.append_paragraph("doc", "second"))
    result = parse(await mcp.insert_paragraph("doc", 0, "before all"))
    assert result["index"] == 0
    kinds = [b["type"] for b in blocks(mcp, "doc")]
    texts = [text_of(b) for b in blocks(mcp, "doc")]
    assert texts[0] == "before all"
    assert texts[-2:] == ["first", "second"]
    assert all(k == "paragraph" for k in kinds[:1] + kinds[-2:])


async def test_an_index_past_the_end_appends(mcp):
    parse(await mcp.append_paragraph("doc", "one"))
    count = len(blocks(mcp, "doc"))
    result = parse(await mcp.insert_paragraph("doc", 999, "last"))
    assert result["index"] == count
    assert text_of(blocks(mcp, "doc")[-1]) == "last"


async def test_heading_quote_and_code_blocks(mcp):
    parse(await mcp.insert_heading("doc", -1, "Title", level=2))
    parse(await mcp.insert_quote("doc", -1, "Said someone"))
    parse(await mcp.insert_code_block("doc", -1, "print(1)", language="python"))
    tail = blocks(mcp, "doc")[-3:]
    assert [b["type"] for b in tail] == ["heading", "quote", "code"]
    assert tail[0]["tag"] == "h2" and text_of(tail[0]) == "Title"
    assert tail[2]["language"] == "python" and text_of(tail[2]) == "print(1)"


async def test_heading_level_is_clamped(mcp):
    parse(await mcp.insert_heading("doc", -1, "Deep", level=9))
    assert blocks(mcp, "doc")[-1]["tag"] == "h6"


async def test_a_jupyter_cell_is_an_input_and_its_output(mcp):
    result = parse(await mcp.insert_jupyter_cell("doc", -1, "x = 1", language="python"))
    assert len(result["added_node_ids"]) == 2
    cell_input, cell_output = blocks(mcp, "doc")[-2:]
    assert cell_input["type"] == "jupyter-input" and text_of(cell_input) == "x = 1"
    assert cell_output["type"] == "jupyter-output"
    assert cell_output["jupyterInputNodeUuid"] == cell_input["jupyterInputNodeUuid"]
    assert cell_output["source"] == "x = 1" and cell_output["outputs"] == []


async def test_any_block_from_its_json(mcp):
    block = {"type": "horizontalrule", "version": 1}
    result = parse(await mcp.insert_block("doc", -1, json.dumps(block)))
    assert result["type"] == "horizontalrule"
    assert blocks(mcp, "doc")[-1]["type"] == "horizontalrule"


async def test_bad_block_json_is_reported(mcp):
    data = json.loads(await mcp.insert_block("doc", -1, "{not json"))
    assert not data["success"] and data["action"] == "insert_block"


async def test_update_text_keeps_the_block(mcp):
    parse(await mcp.append_paragraph("doc", "draft"))
    index = len(blocks(mcp, "doc")) - 1
    before = len(blocks(mcp, "doc"))
    result = parse(await mcp.update_block_text("doc", index, "final"))
    assert result["type"] == "paragraph"
    after = blocks(mcp, "doc")
    assert len(after) == before and text_of(after[index]) == "final"


async def test_update_text_refuses_a_decorator(mcp):
    parse(await mcp.insert_jupyter_cell("doc", -1, "x = 1"))
    index = len(blocks(mcp, "doc")) - 1  # the output
    data = json.loads(await mcp.update_block_text("doc", index, "nope"))
    assert not data["success"] and "jupyter-output" in data["error"]


async def test_delete_block(mcp):
    parse(await mcp.append_paragraph("doc", "gone"))
    index = len(blocks(mcp, "doc")) - 1
    result = parse(await mcp.delete_block("doc", index))
    assert result["total_blocks"] == index
    assert all(text_of(b) != "gone" for b in blocks(mcp, "doc"))


async def test_delete_out_of_range_is_reported(mcp):
    parse(await mcp.append_paragraph("doc", "only"))
    data = json.loads(await mcp.delete_block("doc", 42))
    assert not data["success"] and "42" in data["error"]


async def test_document_info_counts_blocks(mcp):
    parse(await mcp.append_paragraph("doc", "a paragraph"))
    parse(await mcp.insert_heading("doc", -1, "A heading"))
    info = parse(await mcp.get_document_info("doc"))
    assert info["block_types"]["paragraph"] >= 1 and info["block_types"]["heading"] == 1
    assert info["total_blocks"] == len(blocks(mcp, "doc"))
    assert any("A heading" in line for line in info["content_preview"])


async def test_get_and_load_return_the_document(mcp):
    parse(await mcp.append_paragraph("doc", "here"))
    got = parse(await mcp.get_document("doc"))
    loaded = parse(await mcp.load_document("doc"))
    assert without_keys(got["lexical_json"]) == without_keys(loaded["lexical_data"])
    assert got["total_blocks"] == loaded["total_blocks"] == len(blocks(mcp, "doc"))


async def test_save_then_list(mcp):
    parse(await mcp.append_paragraph("kept", "saved text"))
    assert parse(await mcp.save_document("kept"))["saved"]
    listing = parse(await mcp.list_documents())
    assert "kept" in {d["doc_id"] for d in listing["documents"]}
    assert "kept" in {d["doc_id"] for d in listing["open"]}


def test_http_routes_reach_every_tool(mcp):
    app = mcp.mcp.streamable_http_app()
    client = TestClient(app)
    listed = client.get("/tools/list").json()["tools"]
    assert {t["name"] for t in listed} >= {"append_paragraph", "insert_jupyter_cell", "delete_block"}
    assert all("input_schema" in t for t in listed)
    reply = client.post(
        "/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "append_paragraph", "arguments": {"doc_id": "http", "text": "via http"}}}
    ).json()
    assert reply["result"]["success"] and reply["result"]["total_blocks"] >= 1
    legacy = client.post("/", json={"jsonrpc": "2.0", "id": 2, "method": "get_document_info", "params": {"doc_id": "http"}}).json()
    assert legacy["result"]["total_blocks"] >= 1
    unknown = client.post("/", json={"jsonrpc": "2.0", "id": 3, "method": "no_such_tool", "params": {}}).json()
    assert unknown["error"]["code"] == -32601
