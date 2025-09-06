# Lexical-Loro V2 Architecture

## Overview
This implementation follows the YJS collaboration pattern but uses Loro CRDT equivalents:

### YJS → Loro Mappings

| YJS Component | Loro Equivalent | Purpose |
|---------------|-----------------|---------|
| `XmlText` | `LoroTree` | Hierarchical document structure |
| `RelativePosition` | `LoroCursor` | Position tracking and selection |
| `Awareness` | `Ephemeral Store` | Peer state and cursor synchronization |
| `YDoc` | `LoroDoc` | Document container |

## Architecture Components

### 1. Binding System (`LoroBinding.ts`)
- **Purpose**: Central coordination point (equivalent to YJS binding)
- **Key Features**:
  - Maps NodeKeys to collaboration nodes
  - Manages Loro Tree for document structure
  - Handles ephemeral store for awareness
  - Tracks cursor positions and peer states

### 2. Collaboration Nodes (`nodes/`)
- **`LoroCollabElementNode`**: Uses `LoroTree` for hierarchical structure (equivalent to YJS XmlElement)
- **`LoroCollabTextNode`**: Text content synchronization
- **`LoroCollabDecoratorNode`**: Decorator node handling

### 3. Synchronization (`sync/`)
- **`SyncLoroToLexical.ts`**: Bidirectional sync between Loro and Lexical
  - `syncLoroToLexical()`: Apply Loro Tree changes to Lexical
  - `syncLexicalToLoro()`: Convert Lexical operations to Loro Tree operations
  - `initializeSyncHandlers()`: Set up event listeners

- **`CursorSync.ts`**: Cursor and selection synchronization
  - Uses Loro Cursor API (equivalent to YJS RelativePosition)
  - Manages peer cursors through ephemeral store
  - Converts between Lexical selections and Loro cursors

### 4. Plugin Integration (`LoroCollaborativePluginV2.tsx`)
- **Enhanced Features**:
  - Creates Loro binding for collaboration
  - Initializes sync handlers
  - Manages WebSocket communication
  - Handles peer list and cursor updates

## Key Improvements Over V1

1. **Incremental Updates**: Like YJS, only specific changes are synchronized
2. **Tree Structure**: Uses Loro Tree for hierarchical document representation
3. **Cursor Management**: Proper cursor tracking using Loro Cursor API
4. **Awareness**: Peer state management through ephemeral store
5. **Binding Architecture**: Central coordination following YJS patterns

## Implementation Status

### ✅ Completed
- Basic binding structure with Loro Tree
- Collaboration node architecture
- Sync framework setup
- Cursor management structure
- Plugin integration

### 🔄 In Progress
- Tree traversal algorithms
- Delta application logic
- Cursor position conversion
- Ephemeral store integration

### 📋 Next Steps
1. Implement proper tree traversal for sync operations
2. Add delta processing for incremental updates
3. Complete cursor position mapping
4. Integrate ephemeral store for real-time awareness
5. Add conflict resolution strategies

## Usage Example

```typescript
// Create binding
const binding = createLoroBinding(editor, provider, docId, loroDoc, new Map());

// Initialize sync
const cleanup = initializeSyncHandlers(binding);

// Initialize cursor sync
const cursorCleanup = initializeCursorSync(binding);

// Cleanup when done
cleanup();
cursorCleanup();
```

This architecture provides a solid foundation for collaborative editing that follows proven YJS patterns while leveraging Loro's CRDT capabilities.
