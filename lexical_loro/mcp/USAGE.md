# Lexical MCP Server Usage Example

This example demonstrates how to use the Lexical MCP Server with the three available tools.

## Available Tools

### 1. load_document
Load a document by its unique identifier.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "load_document",
    "arguments": {
      "doc_id": "my-document"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "doc_id": "my-document",
  "lexical_data": {
    "root": {
      "children": [],
      "direction": null,
      "format": "",
      "indent": 0,
      "type": "root",
      "version": 1
    },
    "lastSaved": 1756575641097,
    "source": "Lexical Loro",
    "version": "0.34.0"
  },
  "container_id": "my-document"
}
```

### 2. append_paragraph
Append a text paragraph at the end of the document.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "append_paragraph",
    "arguments": {
      "doc_id": "my-document",
      "text": "This is a new paragraph added to the end."
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "doc_id": "my-document",
  "action": "append_paragraph",
  "text": "This is a new paragraph added to the end.",
  "total_blocks": 1
}
```

### 3. insert_paragraph
Insert a text paragraph at a specific index position.

**Request:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "insert_paragraph",
    "arguments": {
      "doc_id": "my-document",
      "index": 0,
      "text": "This paragraph was inserted at the beginning."
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "doc_id": "my-document",
  "action": "insert_paragraph",
  "index": 0,
  "text": "This paragraph was inserted at the beginning.",
  "total_blocks": 2
}
```

## Running the Server

### As a script
```bash
lexical-loro-mcp-server
```

### As a module
```bash
python -m lexical_loro.mcp
```

### Programmatically
```python
import asyncio
from lexical_loro.mcp.server import LexicalMCPServer

async def run_server():
    server = LexicalMCPServer()
    await server.run()

if __name__ == "__main__":
    asyncio.run(run_server())
```

## Error Handling

All tools return structured error responses when something goes wrong:

```json
{
  "success": false,
  "error": "Error description",
  "doc_id": "document-id-if-available"
}
```

## Document Structure

The lexical data follows the Lexical.js format with:
- **root**: The top-level container
- **children**: Array of blocks (paragraphs, headings, etc.)
- **type**: Block type (paragraph, heading, etc.)
- **text**: Text content within text nodes

Each paragraph contains a children array with text nodes that have the actual text content.
