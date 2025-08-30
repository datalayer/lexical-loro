# API Documentation

## Plugin API

### LoroCollaborativePlugin Props

```tsx
interface LoroCollaborativePluginProps {
  websocketUrl: string;          // WebSocket server URL
  docId: string;                 // Unique document identifier
  username: string;              // User identifier
  userColor?: string;            // User cursor color (optional)
  debug?: boolean;               // Enable debug logging (optional)
}
```

### Plugin Features

- **Real-time Sync**: Automatically syncs all text changes via Loro CRDT
- **Cursor Tracking**: Shows other users' cursor positions (experimental)
- **Connection Management**: Handles reconnection and error states
- **Rich Text Preservation**: Maintains formatting during collaborative edits
- **Conflict Resolution**: Automatic conflict-free merging via CRDT

## Server API

### LoroWebSocketServer Class

```python
from lexical_loro import LoroWebSocketServer

# Create server instance
server = LoroWebSocketServer(
    port=8081,           # Server port
    host="localhost"     # Server host
)

# Start server
await server.start()

# Shutdown server
await server.shutdown()
```

### Supported Message Types

The server handles these WebSocket message types:

- `loro-update`: Apply CRDT document updates
- `snapshot`: Full document state snapshots  
- `request-snapshot`: Request current document state
- `ephemeral-update`: Cursor and selection updates
- `awareness-update`: User presence information

## LexicalModel API

### Core Methods

```python
from lexical_loro import LexicalModel

# Document creation
model = LexicalModel.create_document("doc-id")

# Content manipulation
model.add_block(block_detail, block_type)
blocks = model.get_blocks()

# Serialization
json_data = model.to_json(include_metadata=True)
model = LexicalModel.from_json(json_data, "new-doc-id")

# File persistence
model.save_to_file("document.json")
model = LexicalModel.load_from_file("document.json")
```

### Block Types

Supported block types for `add_block()`:

- `paragraph`: Regular text content
- `heading1`, `heading2`, `heading3`: Heading levels
- `list`: Bullet or numbered lists
- `quote`: Blockquotes
- `code`: Code blocks

### Block Detail Structure

```python
block_detail = {
    "text": "Block content",
    "format": 0,           # Text formatting flags
    "style": "",           # CSS style properties
    "children": []         # Nested elements (optional)
}
```

## Configuration

### Plugin Configuration

```tsx
<LoroCollaborativePlugin 
  websocketUrl="ws://localhost:8081"    // Server URL
  docId="my-document"                   // Document identifier  
  username="user123"                    // User identifier
  userColor="#ff0000"                   // Cursor color (optional)
  debug={true}                          // Enable debug logs (optional)
/>
```

### Server Configuration

```python
# Via command line
lexical-loro-server --port 8081 --host localhost --log-level DEBUG

# Via environment variables
export LEXICAL_LORO_PORT=8081
export LEXICAL_LORO_HOST=localhost
export LEXICAL_LORO_LOG_LEVEL=DEBUG
lexical-loro-server

# Programmatically
server = LoroWebSocketServer(port=8081, host="localhost")
```

### Supported Document Types

The server supports multiple document types with different IDs:
- `shared-text`: Basic text collaboration
- `lexical-shared-doc`: Rich text with Lexical  
- Custom document IDs for multiple simultaneous documents
