# Lexical Loro Examples

This directory contains complete working examples demonstrating how to use the Lexical Loro collaborative editing components.

## What's Included

### Complete Demo Application

- **`App.tsx`** - Main demo application with tabbed interface
- **`main.tsx`** - React application entry point  
- **`App.css`** & **`index.css`** - Application styling

### Editor Implementations

- **`LexicalCollaborativeEditor.tsx`** - Rich text Lexical editor with collaboration
- **`TextAreaCollaborativeEditor.tsx`** - Simple text area with collaboration
- **`LexicalToolbar.tsx`** - Rich text formatting toolbar
- **`ServerSelector.tsx`** - UI for switching between server backends

### Additional Examples

- **`CounterComponent.tsx`** - Example of custom collaborative state
- **`CounterNode.tsx`** - Custom Lexical node implementation
- **`counterState.ts`** - State management for counter example
- **`theme.ts`** - Lexical editor theme configuration

## Running the Examples

### Quick Start

```bash
# From the project root
npm install
npm run dev
```

This starts:
- Node.js WebSocket server on port 8080
- Python WebSocket server on port 8081  
- React development server on port 5173

Open http://localhost:5173 to see the demo.

### Individual Servers

Start only specific servers:

```bash
# Python server only
npm run dev:all:py

# Node.js server only  
npm run dev:all:js

# Just the React app (no servers)
npm run dev:vite
```

## Demo Features

### Dual Editor Interface

The demo provides two collaborative editors:

1. **Text Editor**: Basic textarea with real-time collaboration
2. **Lexical Editor**: Full Lexical editor with formatting toolbar

### Server Selection

Switch between backend implementations:
- **Node.js Server**: TypeScript WebSocket server 
- **Python Server**: Python WebSocket server with loro-py

### Real-time Collaboration

- Open multiple browser tabs/windows
- Select the same server in all tabs
- Start typing to see real-time synchronization
- Test rich text formatting (bold, italic, underline)

### Connection Status

Visual indicators show:
- Connection state (connected/disconnected)
- Active server type
- User presence and cursors (experimental)

## Code Structure

### Editor Components

Each editor demonstrates different integration approaches:

**LexicalCollaborativeEditor.tsx**:
- Uses the core `LoroCollaborativePlugin`
- Includes rich text toolbar
- Demonstrates formatting preservation
- Shows cursor tracking (experimental)

**TextAreaCollaborativeEditor.tsx**:
- Direct Loro CRDT integration
- Simple text-only collaboration
- Lightweight implementation
- Good starting point for custom implementations

### Server Integration

**ServerSelector.tsx** shows how to:
- Connect to different WebSocket servers
- Handle connection state changes
- Switch servers dynamically
- Display connection status

## Development Tips

### Adding New Examples

1. Create new component in this directory
2. Import and use `LoroCollaborativePlugin` 
3. Add to `App.tsx` navigation
4. Test with multiple browser tabs

### Customizing Editors

- Modify `theme.ts` for Lexical styling
- Extend `LexicalToolbar.tsx` for new formatting options
- Customize `ServerSelector.tsx` for different server configurations

### Testing Collaboration

1. Open 2+ browser tabs to http://localhost:5173
2. Ensure same server is selected in all tabs
3. Test different editor types
4. Try formatting and cursor positioning
5. Test connection drops and reconnection

## Using in Your Project

These examples show complete implementations you can adapt:

1. **Copy the plugin**: Use `../LoroCollaborativePlugin.tsx` in your project
2. **Adapt the editors**: Modify editor components for your needs  
3. **Use the server**: Deploy the Python server for your backend
4. **Customize UI**: Build your own interface using the components as reference

## Troubleshooting

### Connection Issues

- Ensure WebSocket servers are running
- Check browser console for error messages
- Verify correct ports (8080 for Node.js, 8081 for Python)

### Sync Problems  

- Refresh all browser tabs
- Check that same server is selected in all tabs
- Look for network connectivity issues
- Enable debug logging in plugin

### Development Issues

- Run `npm install` if dependencies are missing
- Check that Python dependencies are installed: `pip install -e .`
- Verify Node.js version (16+ required)

For more help, see the main project README or open an issue on GitHub.
