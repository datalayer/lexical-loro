# Current Document Functionality

## Overview

The Lexical MCP Server now supports a **current document** concept that allows users to set a default document for operations, making the `doc_id` parameter optional for most tools (except `load_document`).

## New Tool

### `set_current_document`

Sets the current document for subsequent operations.

**Parameters:**
- `doc_id` (string, required): The unique identifier of the document to set as current

**Returns:**
- JSON string confirming the current document has been set
- Includes the document ID and container ID

**Example:**
```json
{
  "doc_id": "my-document",
}
```

**Response:**
```json
{
  "success": true,
  "message": "Current document set to: my-document",
  "doc_id": "my-document",
  "container_id": "my-document"
}
```

## Modified Tools

The following tools now have optional `doc_id` parameters and will use the current document when `doc_id` is not provided:

### `append_paragraph`

**New signature:**
- `text` (string, required): The text content of the paragraph to append
- `doc_id` (string, optional): The document ID (uses current document if not provided)

### `insert_paragraph`

**New signature:**
- `index` (integer, required): The index position where to insert the paragraph (0-based)
- `text` (string, required): The text content of the paragraph to insert
- `doc_id` (string, optional): The document ID (uses current document if not provided)

### `get_document_info`

**New signature:**
- `doc_id` (string, optional): The document ID (uses current document if not provided)

## Usage Examples

### Basic Workflow

1. **Set current document:**
   ```json
   {
     "tool": "set_current_document",
     "arguments": {"doc_id": "my-doc"}
   }
   ```

2. **Append to current document:**
   ```json
   {
     "tool": "append_paragraph",
     "arguments": {"text": "Hello world!"}
   }
   ```

3. **Insert into current document:**
   ```json
   {
     "tool": "insert_paragraph",
     "arguments": {"index": 0, "text": "First paragraph"}
   }
   ```

4. **Get current document info:**
   ```json
   {
     "tool": "get_document_info",
     "arguments": {}
   }
   ```

### Error Handling

If you try to use a tool that requires a document without setting a current document or providing `doc_id`, you'll get an error:

```json
{
  "success": false,
  "error": "No document ID provided and no current document set. Use set_current_document first or provide doc_id."
}
```

### Explicit Override

You can always provide an explicit `doc_id` to override the current document:

```json
{
  "tool": "append_paragraph",
  "arguments": {
    "text": "This goes to a specific document",
    "doc_id": "other-document"
  }
}
```

## Backward Compatibility

- All existing code continues to work unchanged
- The `load_document` tool still requires an explicit `doc_id` parameter
- When `doc_id` is provided explicitly, it takes precedence over the current document
- Legacy test interfaces are maintained through wrapper functions

## Implementation Details

- Current document state is maintained globally across server instances
- The current document is validated when set (document is created if it doesn't exist)
- All tools maintain the same return format
- Error handling includes appropriate context about missing document IDs

## Testing

The functionality is thoroughly tested with:
- 7 new unit tests covering all scenarios
- Integration with existing 18 tests (11 unit + 7 integration)
- Backward compatibility verification
- Error handling validation
- Workflow testing with multiple operations
