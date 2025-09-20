# Architecture Documentation

## How It Works

### Architecture Overview

The collaboration system consists of two main components:

1. **LoroCollaborativePlugin** (Client-side)
   - Integrates with Lexical editor as a React plugin
   - Captures text changes and applies them to Loro CRDT document
   - Sends/receives updates via WebSocket connection
   - Handles cursor positioning and user awareness

2. **LoroWebSocketServer** (Server-side)  
   - Python WebSocket server using loro-py
   - Maintains authoritative document state
   - Broadcasts updates to all connected clients
   - Handles client connections and disconnections

3. **LexicalModel** (Standalone Library)
   - Independent document model with CRDT capabilities
   - Supports serialization and file persistence
   - Can be used without WebSocket server
   - Provides programmatic document manipulation

### Data Flow

```
User Types → Lexical Editor → Plugin → Loro CRDT → WebSocket
                                                        ↓
WebSocket ← Loro CRDT ← Plugin ← Lexical Editor ← Other Users
```

For standalone usage:
```
Application → LexicalModel → Loro CRDT → File/JSON → Application
```

### CRDT Integration Process

1. **Document Creation**: Plugin creates a Loro document with unique identifier
2. **Local Changes**: User edits trigger Lexical change events  
3. **CRDT Application**: Changes are applied to local Loro document
4. **Synchronization**: Updates are serialized and sent via WebSocket
5. **Remote Application**: Other clients receive and apply updates
6. **Conflict Resolution**: Loro CRDT automatically merges changes without conflicts

### Connection Management

- **Auto-reconnection**: Plugin handles connection drops gracefully
- **State Synchronization**: New clients receive full document snapshot
- **Error Handling**: Connection errors are logged and displayed
- **User Awareness**: Track online users and cursor positions

### Lexical Integration

The Lexical editor integration includes:

1. **LoroCollaborativePlugin**: A custom Lexical plugin that bridges Lexical and Loro CRDT
2. **Bidirectional Sync**: Changes flow from Lexical → Loro → WebSocket and vice versa
3. **Rich Text Preservation**: The plugin maintains rich text formatting during collaborative editing
4. **Independent State**: Lexical editor maintains separate document state from simple text editor

### WebSocket Communication

The WebSocket server:
- Maintains connections to all clients
- Broadcasts Loro document updates to all connected clients with document ID filtering
- Handles client connections and disconnections
- Provides connection status feedback
- Stores separate snapshots for each document type

### Real-time Updates

1. User types in the text area
2. Change is applied to local Loro document
3. Document update is serialized and sent via WebSocket
4. Other clients receive the update and apply it to their models
5. UI is updated to reflect the changes

### Initial Content Synchronization

When a new collaborator joins:

1. **Connection**: New client connects to WebSocket server
2. **Welcome**: Server sends welcome message to new client
3. **Snapshot Request**: New client requests current document state
4. **Snapshot Delivery**: Server sends stored snapshot or requests one from existing clients
5. **Content Sync**: New client applies snapshot and sees current document content
6. **Ready to Collaborate**: New client can now participate in real-time editing

The server maintains the latest document snapshot to ensure new collaborators always see existing content.

## Component Architecture

### Client-Side Components

```
React Application
├── LexicalComposer
│   ├── RichTextPlugin
│   ├── LoroCollaborativePlugin ← Core collaboration
│   ├── Other Lexical Plugins (after init)
│   └── ContentEditable
└── Connection Status UI
```

### Server-Side Components

```
Python WebSocket Server
├── Connection Manager
├── Document Store (Loro CRDT)
├── Message Router
├── Client Registry
└── Snapshot Manager
```

### LexicalModel Components

```
LexicalModel
├── Loro CRDT Document
├── Lexical State Manager
├── Serialization Layer
├── File I/O Operations
└── Event System
```

## Message Flow

### WebSocket Messages

1. **loro-update**: Document content changes
2. **snapshot**: Full document state
3. **request-snapshot**: Request current state
4. **ephemeral-update**: Cursor positions
5. **awareness-update**: User presence

### Internal Events

1. **Document Changes**: Lexical → CRDT → Network
2. **Remote Updates**: Network → CRDT → Lexical
3. **Connection Events**: Connect, disconnect, error
4. **Synchronization**: Initial load, resync, conflict resolution

## Performance Considerations

### Memory Management

- **CRDT History**: Loro maintains change history for conflict resolution
- **Document Snapshots**: Server stores latest state for new clients
- **Client Buffers**: Temporary storage for pending updates

### Network Optimization

- **Delta Updates**: Only changes are transmitted, not full models
- **Compression**: WebSocket messages can be compressed
- **Batching**: Multiple rapid changes can be batched together

### Scalability

- **Horizontal Scaling**: Multiple server instances with shared state
- **Document Partitioning**: Large models can be split into sections
- **Connection Limits**: Server can handle hundreds of concurrent connections

## Security Considerations

### Authentication

- WebSocket connections can include authentication tokens
- Document access can be controlled per user
- Server can validate user permissions before allowing edits

### Data Protection

- All communication is over WebSocket (can be secured with WSS)
- Document content is not encrypted by default
- Sensitive models should use additional encryption

### Input Validation

- Server validates all incoming CRDT operations
- Malformed updates are rejected
- Client state is validated against server state
