# Lexical MCP Server

This module provides a Model Context Protocol (MCP) server for managing Lexical models using the Loro collaborative editing backend.

## Overview

The Lexical MCP Server exposes three main tools for document manipulation:

1. **load_document** - Load a document by its ID
2. **insert_paragraph** - Insert a text paragraph at a specific index
3. **append_paragraph** - Append a text paragraph at the end of the document

## Tools

### load_document

Loads a document by its unique identifier. If the document doesn't exist, it will be created with default structure.

**Parameters:**
- `doc_id` (string, required): The unique identifier of the document

**Returns:**
- Success response with lexical_data structure and metadata
- Error response if loading fails

### insert_paragraph

Inserts a text paragraph at a specific index position in the document.

**Parameters:**
- `doc_id` (string, required): The unique identifier of the document
- `index` (integer, required): The 0-based index position where to insert the paragraph
- `text` (string, required): The text content of the paragraph

**Returns:**
- Success response with action confirmation and total block count
- Error response if insertion fails

### append_paragraph

Appends a text paragraph at the end of the document.

**Parameters:**
- `doc_id` (string, required): The unique identifier of the document  
- `text` (string, required): The text content of the paragraph

**Returns:**
- Success response with action confirmation and total block count
- Error response if append fails

## Usage

### Running the Server

```bash
# Run as a module
python -m lexical_loro.mcp

# Or run the server directly
python -m lexical_loro.mcp.server
```

### Integration

The server uses the `LexicalDocumentManager` to handle multiple models and the `LexicalModel` for document operations. Each document is managed as a separate Loro document with real-time collaboration capabilities.

## Architecture

- **LexicalMCPServer**: Main server class that handles MCP protocol
- **LexicalDocumentManager**: Manages multiple document instances
- **LexicalModel**: Individual document model with Loro backend
- **Tools**: Three exposed tools for document manipulation

The server maintains document state using Loro's collaborative editing capabilities, allowing for real-time synchronization across multiple clients.

## Error Handling

All tools include comprehensive error handling and return structured JSON responses indicating success or failure, along with relevant error messages and context information.
