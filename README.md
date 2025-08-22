[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# ✍️ 🦜 Lexical Loro - Collaborative Plugin for Lexical based on Loro CRDT

A collaborative editing plugin for [Lexical](https://github.com/facebook/lexical) rich editor built with [Loro](https://github.com/loro-dev) CRDT, providing real-time collaborative editing capabilities with conflict-free synchronization.

## Core Components

This package provides two main components for building collaborative text editors:

1. **`LoroCollaborativePlugin.tsx`** - A Lexical plugin that integrates Loro CRDT for real-time collaborative editing
2. **`lexical-loro` Python package** - A WebSocket server using [loro-py](https://github.com/loro-dev/loro-py) for maintaining document state server-side

## Quick Start

### Using the Lexical Plugin

```tsx
import { LoroCollaborativePlugin } from './src/LoroCollaborativePlugin';

function MyEditor() {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <RichTextPlugin />
      <LoroCollaborativePlugin 
        websocketUrl="ws://localhost:8081"
        docId="my-document"
        username="user1"
      />
    </LexicalComposer>
  );
}
```

### Using the Python Server

```bash
# Install the Python package
pip install -e .

# Start the server
lexical-loro-server --port 8081
```

## Examples

For complete working examples, see the `src/examples/` directory which contains:
- Full React application with dual editor support
- Server selection interface
- Connection status indicators
- Rich text formatting examples

**DISCLAIMER** Collaborative Cursors still need fixes, see [this issue](https://github.com/datalayer/lexical-loro/issues/1).

<div align="center" style="text-align: center">
  <img alt="" src="https://assets.datalayer.tech/lexical-loro.gif" />
</div>

## Core Features

- 🔄 **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- 🚀 **Conflict-free**: Uses Loro CRDT to automatically resolve conflicts  
- 📝 **Lexical Integration**: Seamless integration with Lexical rich text editor
- 🌐 **WebSocket Server**: Python server for maintaining document state
- 📡 **Connection Management**: Robust WebSocket connection handling
- ✨ **Rich Text Support**: Preserves formatting during collaborative editing
- 🔧 **Extensible**: Plugin-based architecture for easy customization

## Technology Stack

**Core Dependencies:**
- **Lexical**: v0.33.1 (Facebook's extensible text editor framework)
- **Loro CRDT**: v1.5.10 (Conflict-free replicated data types)
- **React**: 18/19 (for plugin hooks and components)
- **Python**: 3.8+ with loro-py and websockets

**Development Dependencies:**
- **TypeScript**: For type safety
- **Vite**: For building and development (examples only)
- **pytest**: Python testing
- **ESLint**: Code linting

## Installation

### Core Plugin

The Lexical plugin is a single TypeScript/React component that you can copy into your project:

```bash
# Copy the plugin file
cp src/LoroCollaborativePlugin.tsx your-project/src/
```

**Dependencies required:**
```bash
npm install lexical @lexical/react @lexical/selection loro-crdt react react-dom
```

### Python Server

Install the Python WebSocket server:

```bash
# Install from this repository
pip install -e .

# Or install specific dependencies
pip install websockets click loro
```

## Usage

### 1. Lexical Plugin Integration

Add the plugin to your Lexical editor:

```tsx
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LoroCollaborativePlugin } from './LoroCollaborativePlugin';

const editorConfig = {
  namespace: 'MyEditor',
  theme: {},
  onError: console.error,
};

function CollaborativeEditor() {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="editor-container">
        <RichTextPlugin
          contentEditable={<ContentEditable className="editor-input" />}
          placeholder={<div className="editor-placeholder">Start typing...</div>}
          ErrorBoundary={() => <div>Error occurred</div>}
        />
        <LoroCollaborativePlugin 
          websocketUrl="ws://localhost:8081"
          docId="shared-document"
          username="user123"
        />
      </div>
    </LexicalComposer>
  );
}
```

### 2. Python Server Setup

Start the WebSocket server:

```bash
# Default port (8081)
lexical-loro-server

# Custom port
lexical-loro-server --port 8082

# With debug logging
lexical-loro-server --port 8081 --log-level DEBUG
```

### 3. Programmatic Server Usage

```python
import asyncio
from lexical_loro import LoroWebSocketServer

async def main():
    server = LoroWebSocketServer(port=8081)
    await server.start()
    print("Server running on ws://localhost:8081")

if __name__ == "__main__":
    asyncio.run(main())
```

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

## Examples

For complete working examples and demonstrations, see the `src/examples/` directory:

```bash
# Run the example application
npm install
npm run example

# This starts both Node.js and Python servers plus a React demo app
# Open http://localhost:5173 to see dual editor interface
```

The examples include:
- **Complete React App**: Full collaborative editor with UI
- **Server Selection**: Switch between Node.js and Python backends  
- **Dual Editors**: Simple text area and rich Lexical editor
- **Real-time Demo**: Multi-user collaboration testing

See `src/examples/README.md` for detailed example documentation.

## Project Structure

### Core Components

```
src/
├── LoroCollaborativePlugin.tsx         # Main Lexical plugin for collaboration
└── vite-env.d.ts                       # TypeScript definitions

lexical_loro/                           # Python WebSocket server package
├── __init__.py                         # Package exports
├── server.py                           # WebSocket server implementation  
├── cli.py                              # Command line interface
└── tests/                              # Python test suite

pyproject.toml                          # Python package configuration
```

### Examples Directory

```
src/examples/                           # Complete demo application
├── App.tsx                             # Demo app with dual editors
├── LexicalCollaborativeEditor.tsx      # Rich text editor example
├── TextAreaCollaborativeEditor.tsx     # Simple text editor example
├── ServerSelector.tsx                  # Server selection UI
├── LexicalToolbar.tsx                  # Rich text toolbar
├── main.tsx                            # Demo app entry point
└── *.css                               # Styling for examples

servers/
└── server.ts                           # Node.js server (for comparison)
```

### Archive

```
src/archive/                            # Historical plugin implementations
├── LoroCollaborativePlugin0.tsx        # Previous versions for reference
├── LoroCollaborativePlugin1.tsx
├── LoroCollaborativePlugin2.tsx
├── LoroCollaborativePlugin3.tsx
├── LoroCollaborativePlugin4.tsx
└── LoroCollaborativePlugin5.tsx
```

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

### Data Flow

```
User Types → Lexical Editor → Plugin → Loro CRDT → WebSocket
                                                        ↓
WebSocket ← Loro CRDT ← Plugin ← Lexical Editor ← Other Users
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
4. Other clients receive the update and apply it to their documents
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

## Development

### Core Components Development

**Plugin Development:**
```bash
# The plugin is a single TypeScript file
src/LoroCollaborativePlugin.tsx

# Dependencies for plugin development
npm install lexical @lexical/react @lexical/selection loro-crdt
```

**Server Development:**  
```bash
# Install Python package in development mode
pip install -e ".[dev]"

# Run tests
pytest lexical_loro/tests/ -v

# Start server in development mode  
python3 -m lexical_loro.cli --port 8081 --log-level DEBUG
```

### Testing

**Plugin Testing:**
```bash
npm run test              # Run Vitest tests
npm run test:js          # Run tests once
```

**Server Testing:**
```bash
npm run test:py          # Run Python tests
npm run test:py:watch    # Run in watch mode
npm run test:py:coverage # Run with coverage
```

### Example Development

To work on the examples:
```bash
npm install                    # Install all dependencies
npm run example               # Start example app with both servers  
npm run example:py            # Start with Python server only
npm run example:js            # Start with Node.js server only
npm run example:vite          # Start example app only (no servers)
```

## Contributing

We welcome contributions to both the Lexical plugin and Python server:

1. Fork the repository
2. Create a feature branch  
3. Focus changes on core components:
   - `src/LoroCollaborativePlugin.tsx` for plugin improvements
   - `lexical_loro/` for server enhancements
4. Add tests for new functionality
5. Update documentation as needed
6. Submit a pull request

### Development Guidelines

- **Plugin**: Keep the plugin self-contained and dependency-light
- **Server**: Maintain compatibility with loro-py and WebSocket standards  
- **Examples**: Use examples to demonstrate new features
- **Tests**: Ensure both JavaScript and Python tests pass

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Loro CRDT](https://loro.dev/) - The CRDT library powering collaborative editing
- [Lexical](https://lexical.dev/) - Facebook's extensible text editor framework  
- [React](https://reactjs.org/) - UI library for plugin hooks
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) - Real-time communication
