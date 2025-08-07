# Servers Directory

This directory contains the WebSocket servers for the LORO collaborative editor.

## Server Files

### TypeScript Server (`server.ts`)
- **Port**: 8080
- **Purpose**: Main WebSocket server implemented in TypeScript
- **Features**: Document synchronization, cursor awareness, real-time collaboration
- **Run**: `npm run server`

### Python Server (`server.py`)
- **Port**: 8081
- **Purpose**: Alternative WebSocket server implemented in Python
- **Features**: Document synchronization, cursor awareness, testing capabilities
- **Run**: `npm run server:py`

## Available Scripts

### Start Individual Servers
```bash
# Start TypeScript server (port 8080)
npm run server

# Start Python server (port 8081)
npm run server:py
```

### Start Development Environment
```bash
# Start both servers + frontend
npm run dev:all

# Start Python server + frontend
npm run dev:all:py

# Start TypeScript server + frontend
npm run dev:all:js
```

## Server Architecture

Both servers implement the same WebSocket protocol for LORO document synchronization:

1. **Document Management**: Handle multiple collaborative documents
2. **Client Connections**: Manage WebSocket connections and client sessions
3. **Ephemeral Store**: Track cursor positions and user awareness
4. **Real-time Sync**: Broadcast document changes to all connected clients
5. **Snapshots**: Provide document state to newly connected clients

## Development

The servers support hot-reloading during development and can run simultaneously on different ports for testing and comparison purposes.
