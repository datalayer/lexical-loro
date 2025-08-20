[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Collaborative Plugin for Lexical based on Loro CRDT

A real-time collaborative editing application for [Lexical](https://github.com/facebook/lexical) built with [Loro CRDT](https://github.com/loro-dev), React, TypeScript, Vite with a Python WebSocket server using [loro-py](https://github.com/loro-dev/loro-py) to maintain the Lexical JSON model sever-side

Features both simple text editing and rich text editing with Lexical. Multiple users can edit the same documents simultaneously with conflict-free collaborative editing powered by Conflict-free Replicated Data Types (CRDTs).

**DISCLAIMER** Collaborative Cursors still need fixes, see [this issue](https://github.com/datalayer/lexical-loro/issues/1).

**NEW** Now supports both Node.js and Python WebSocket servers!

<div align="center" style="text-align: center">
  <img alt="" src="https://assets.datalayer.tech/lexical-loro.gif" />
</div>

## Features

- 🔄 **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- 🚀 **Conflict-free**: Uses Loro CRDT to automatically resolve conflicts
- 📝 **Dual Editor Support**: Choose between simple text area or rich text Lexical editor
- 🌐 **Multi-server Support**: Choose between Node.js and Python WebSocket servers
- ⚡ **Fast Development**: Built with Vite for lightning-fast development
- 🎨 **Responsive Design**: Works on desktop and mobile devices
- 📡 **Connection Status**: Visual indicators for connection state
- ✨ **Rich Text Features**: Bold, italic, underline with real-time formatting sync
- 🔧 **Server Selection**: Switch between Node.js and Python backends

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **CRDT Library**: Loro CRDT
- **Rich Text Editor**: Lexical (Facebook's extensible text editor)
- **Backend Options**: 
  - Node.js + TypeScript + ws library
  - Python + loro-py + websockets library
- **Real-time Communication**: WebSockets (ws)
- **Styling**: CSS3 with responsive design
- **Development Tools**: ESLint, tsx, concurrently

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Python 3.8+ (for Python server option)
- pip3 (for Python dependencies)

### Installation

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Install Python dependencies (optional - for Python server):
   ```bash
   pip3 install -r requirements.txt
   # or run the setup script
   ./setup-python.sh
   ```

### Running the Application

#### Option 1: All Servers (Recommended)
```bash
npm run dev:all
```
This starts **both** WebSocket servers (Node.js on port 8080 and Python on port 8081) plus the React development server (port 5173). You can then switch between servers using the UI.

#### Option 2: Python Server Only
```bash
npm run dev:all:py
```
This starts only the Python WebSocket server (port 8081) and React development server.

#### Option 3: Node.js Server Only
```bash
npm run dev:all:js
```
This starts only the Node.js WebSocket server (port 8080) and React development server.

#### Option 4: Run servers separately

**All servers manually:**
```bash
# Terminal 1: Start Node.js WebSocket server
npm run server

# Terminal 2: Start Python WebSocket server
npm run server:py

# Terminal 3: Start React development server
npm run dev
```

**Node.js Server only:**
```bash
# Terminal 1: Start Node.js WebSocket server
npm run server

# Terminal 2: Start React development server
npm run dev
```

**Python Server only:**
```bash
# Terminal 1: Start Python WebSocket server
npm run server:py
# or directly: python3 server.py

# Terminal 2: Start React development server
npm run dev
```

2. In another terminal, start the React development server:
   ```bash
   npm run dev
   ```

### Usage

1. Open your browser and navigate to the development server URL (typically `http://localhost:5173`)
2. **Select Server Type**: Use the server selection radio buttons to choose:
   - **Node.js Server**: `ws://localhost:8080` (TypeScript implementation)
   - **Python Server**: `ws://localhost:8081` (Python + loro-py implementation)
   
   💡 **Tip**: When using `npm run dev:all`, both servers are running simultaneously, so you can switch between them in real-time!

3. **Choose Editor Type**: Click the tabs to select:
   - **Simple Text Editor**: A basic textarea for plain text collaboration
   - **Rich Text Editor (Lexical)**: A full-featured rich text editor with Bold/Italic/Underline formatting
4. Start typing in either editor
5. Open another browser window/tab or share the URL with others
6. All users will see real-time updates as they type in the same editor type
7. Each editor maintains its own document state (they are separate collaborative spaces)

**Note**: You must disconnect from the current server before switching to a different server type.

### Testing Collaboration

To test the real-time collaboration:

1. Open multiple browser tabs/windows to the development server URL
2. **Select the same server** in all tabs (Node.js or Python)
3. **Test Simple Text Editor**:
   - Keep all tabs on the "Simple Text Editor" tab
   - Start typing in one window - you'll see the changes appear in other windows instantly
4. **Test Lexical Rich Text Editor**:
   - Switch all tabs to the "Rich Text Editor (Lexical)" tab
   - Try formatting text with the toolbar buttons (Bold, Italic, Underline)
   - Changes and formatting will sync in real-time across all tabs
5. **Test Cross-Server Compatibility**: 
   - Verify that documents are properly synchronized between Node.js and Python servers
   - Each server maintains its own document state
6. **Test Independent Documents**:
   - Have some tabs on "Simple Text Editor" and others on "Lexical Editor"
   - Notice that each editor type maintains its own separate document
5. **New collaborators will automatically receive the current document content** when they join

**Note**: The application now properly synchronizes initial content:
- When a new collaborator joins, they automatically receive the current document state for both editors
- If no snapshot is available on the server, existing clients will provide their current state
- The first client to join with content will automatically share their document state
- Each editor type (simple text vs Lexical) maintains separate collaborative documents

## Project Structure

```
src/
├── App.tsx                         # Main application component with tabbed interface
├── App.css                         # Application styles
├── CollaborativeEditor.tsx         # Simple text editor component with Loro CRDT integration
├── CollaborativeEditor.css         # Simple editor styles
├── LexicalCollaborativeEditor.tsx  # Lexical rich text editor component
├── LexicalCollaborativeEditor.css  # Lexical editor styles
├── LoroCollaborativePlugin.tsx     # Lexical plugin for Loro CRDT integration
├── main.tsx                        # React application entry point
└── vite-env.d.ts                   # Vite type definitions

server.ts                           # WebSocket server for real-time communication
package.json                        # Dependencies and scripts
```

## How It Works

### Loro CRDT Integration

The application uses Loro CRDT to manage collaborative editing across two different editor types:

1. **Document Creation**: Each editor type creates its own Loro document with a unique identifier:
   - Simple Text Editor: `shared-text`
   - Lexical Editor: `lexical-shared-doc`
2. **Local Changes**: When a user types, changes are applied to the corresponding local Loro document
3. **Change Detection**: The application detects insertions, deletions, and replacements
4. **Synchronization**: Changes are serialized and sent to other clients via WebSocket with document ID
5. **Conflict Resolution**: Loro CRDT automatically merges changes without conflicts

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

### WebSocket Server URL

You can configure the WebSocket server URL in the UI or by modifying the default in `CollaborativeEditor.tsx`:

```typescript
const [websocketUrl, setWebsocketUrl] = useState('ws://localhost:8080')
```

### Server Port

To change the server port, modify `server.ts`:

```typescript
const server = new LoroWebSocketServer(8080); // Change port here
```

## Development Scripts

- `npm run dev` - Start React development server
- `npm run server` - Start WebSocket server
- `npm run dev:all` - Start both server and client
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Deploy the `dist` folder to your web server

3. Deploy the WebSocket server to your backend infrastructure

4. Update the WebSocket URL in the application to point to your production server

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Loro CRDT](https://loro.dev/) - The CRDT library powering collaborative editing
- [Vite](https://vitejs.dev/) - Fast development build tool
- [React](https://reactjs.org/) - UI library
- [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

# Lexical Loro Python Package

A Python package for Lexical + Loro CRDT integration, providing a WebSocket server for real-time collaborative text editing.

## Features

- **Real-time collaboration**: WebSocket server for live document collaboration
- **Loro CRDT integration**: Uses Loro CRDT for conflict-free replicated data types
- **Lexical compatibility**: Designed to work with Lexical rich text editor
- **Ephemeral data support**: Handles cursor positions and selections
- **Multiple document support**: Manages multiple collaborative documents

## Installation

### From PyPI (when published)

```bash
pip install lexical-loro
```

### Local Development

```bash
# Install in development mode
pip install -e "python_src/[dev]"
```

## Usage

### Command Line

Start the server using the command line interface:

```bash
# Start server on default port (8081)
lexical-loro-server

# Start server on custom port
lexical-loro-server --port 8082

# Start with debug logging
lexical-loro-server --log-level DEBUG
```

### Programmatic Usage

```python
import asyncio
from lexical_loro import LoroWebSocketServer

async def main():
    server = LoroWebSocketServer(port=8081)
    await server.start()

if __name__ == "__main__":
    asyncio.run(main())
```

### Integration with Node.js/TypeScript Projects

Update your `package.json` scripts:

```json
{
  "scripts": {
    "server:py": "lexical-loro-server",
    "dev:py": "concurrently \"lexical-loro-server\" \"npm run dev\""
  }
}
```

## API Reference

### LoroWebSocketServer

Main server class for handling WebSocket connections and Loro document management.

#### Constructor

```python
server = LoroWebSocketServer(port=8081)
```

#### Methods

- `start()`: Start the WebSocket server
- `shutdown()`: Gracefully shutdown the server
- `handle_client(websocket)`: Handle new client connections
- `handle_message(client_id, message)`: Process messages from clients

### Client

Represents a connected client with metadata.

```python
class Client:
    def __init__(self, websocket, client_id):
        self.websocket = websocket
        self.id = client_id
        self.color = self._generate_color()
```

## Development

### Setup Development Environment

```bash
# Install development dependencies
pip install -e "python_src/[dev]"

# Run tests
pytest

# Run tests with coverage
pytest --cov=lexical_loro --cov-report=html

# Format code
black python_src/

# Lint code
ruff python_src/

# Type checking
mypy python_src/
```

### Testing

The package includes comprehensive tests for:

- WebSocket connection handling
- Loro document operations
- Message processing
- Client management
- Error handling

Run tests:

```bash
pytest tests/ -v
```

### Building

Build the package:

```bash
pip install build
python -m build
```

## Protocol

The server communicates with clients using a JSON-based WebSocket protocol:

### Message Types

- `loro-update`: Apply Loro CRDT updates
- `snapshot`: Full document snapshots
- `request-snapshot`: Request current document state
- `ephemeral-update`: Cursor and selection updates
- `awareness-update`: User presence information

### Example Messages

```json
{
  "type": "loro-update",
  "docId": "lexical-shared-doc",
  "updateHex": "deadbeef..."
}
```

## Configuration

### Environment Variables

- `LEXICAL_LORO_PORT`: Default server port (default: 8081)
- `LEXICAL_LORO_HOST`: Host to bind to (default: localhost)
- `LEXICAL_LORO_LOG_LEVEL`: Logging level (default: INFO)

### Supported Documents

The server pre-initializes several document types:

- `shared-text`: Basic text document
- `lexical-shared-doc-v0`: Minimal plugin document
- `lexical-shared-doc-v1`: Full-featured plugin document
- `lexical-shared-doc-v2`: Clean JSON plugin document
- `lexical-shared-doc-v3`: Text-only plugin document
- `lexical-shared-doc-v4`: Smart hybrid plugin document

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## Support

For issues and questions:

- GitHub Issues: https://github.com/datalayer/lexical-loro/issues
- Documentation: https://github.com/datalayer/lexical-loro#readme

