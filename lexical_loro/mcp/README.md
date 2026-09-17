# Lexical Loro MCP Server

An [MCP](https://modelcontextprotocol.io) server that reads and writes Lexical
documents through their Loro collaboration rooms. Every tool takes a `doc_id`,
which is the room's name: the server joins that room on the relay, so what a
tool writes appears in every editor on the room as it happens, and what the
editors write is what the tools read.

Built on the `mcp` Python package (2.x) — `MCPServer` with the Streamable HTTP
and stdio transports.

## Running

```bash
# Streamable HTTP, beside a relay on ws://localhost:3002
python -m lexical_loro.mcp start --transport streamable-http --port 3001 \
    --websocket-url ws://localhost:3002 --documents-path ./documents

# stdio, for a client that spawns the server
python -m lexical_loro.mcp start --transport stdio --websocket-url ws://localhost:3002
```

The Streamable HTTP endpoint is `/mcp`. Two plain HTTP routes serve a client
without an MCP SDK: `GET /tools/list` (the tools, with their input schemas)
and `POST /` (JSON-RPC: `tools/list`, `tools/call` with `name` and
`arguments`, or a tool's name as `method` with its arguments as `params`).

## Tools

Reading:

- `list_documents` — the documents saved under the documents path, and the
  ones open in memory with their room connection state.
- `get_document` / `load_document` — the document as Lexical JSON.
- `get_document_info` — block count, counts by block type, a text preview of
  each block.

Writing — a block is a top-level node of the document; `index` is its
zero-based position, and a negative or too large index appends:

- `append_paragraph`, `insert_paragraph` — a paragraph.
- `insert_heading` (`level` 1–6), `insert_quote`, `insert_code_block`
  (`language`) — the other text blocks.
- `insert_jupyter_cell` — an executable cell: the input holding the `code`,
  followed by its output.
- `insert_block` — any block from its serialized Lexical JSON.
- `update_block_text` — new text for the block at `index`, keeping the block.
- `delete_block` — removes the block at `index`.
- `save_document` — writes the document to the documents path.

Every tool answers a JSON string with `success`, the `doc_id`, and what it
did (`index`, `added_node_ids`, `total_blocks`…) or an `error`.

## Tests

`tests/test_mcp_tools.py` exercises every tool and the HTTP routes against a
document manager in a temporary directory, without a relay.
