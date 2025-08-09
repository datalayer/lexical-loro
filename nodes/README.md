[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# `@lexical/loro`

This package provides a set of bindings for Loro CRDT that allow for collaborative editing with Lexical.

## Installation

```bash
npm install @lexical/loro loro-crdt
```

## Usage

```typescript
import { createBinding, initLocalState } from '@lexical/loro';
import { createEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';

// Create a Loro document
const doc = new LoroDoc();

// Create a Lexical editor
const editor = createEditor({
  // your editor config
});

// Create the binding
const binding = createBinding(
  editor,
  provider, // Your Loro provider
  'unique-doc-id',
  doc,
  new Map(), // docMap
);

// Initialize local user state
initLocalState(
  provider,
  'User Name',
  '#ff0000', // user color
  true, // focusing
  {} // awareness data
);
```

## Features

- Real-time collaborative editing using Loro CRDT
- Cursor synchronization between users
- Undo/redo operations
- Awareness (user presence) support

## API

### `createBinding(editor, provider, id, doc, docMap, excludedProperties?)`

Creates a binding between a Lexical editor and a Loro document.

### `initLocalState(provider, name, color, focusing, awarenessData)`

Initializes the local user state for collaboration.

### `setLocalStateFocus(provider, name, color, focusing, awarenessData)`

Updates the focus state of the local user.

### `createUndoManager(binding, root)`

Creates an undo manager for the collaborative editor.

## Types

### `Provider`

Interface for collaboration providers that work with Loro.

### `UserState`

Represents the state of a user in the collaborative session.

### `Binding`

The binding object that connects Lexical and Loro.

## Comparison with Yjs

This package provides similar functionality to `@lexical/yjs` but uses Loro CRDT instead of Yjs:

- **Loro advantages**: Better performance for certain operations, different conflict resolution strategies
- **API similarity**: Most APIs are similar to maintain familiarity for developers migrating from Yjs

## Contributing

This package is part of the Lexical monorepo. Please see the main repository for contribution guidelines.

# Lexical Collaborative Editing Example with Loro

This example demonstrates how to use the `@lexical/loro` package for collaborative editing with Lexical and Loro CRDT.

## Features

- Real-time collaborative editing
- User presence and cursor tracking
- Undo/redo operations
- Conflict-free collaborative text editing

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open multiple browser windows/tabs to test collaboration.

## Usage

The example shows how to:

1. Set up a Loro document for collaboration
2. Create a Lexical editor with Loro bindings  
3. Handle user awareness and cursor synchronization
4. Manage collaborative state updates

## Key Components

- `LoroProvider`: Manages the Loro document and collaboration state
- `CollaborativeEditor`: The main Lexical editor with Loro integration
- `UserPresence`: Displays active users and their cursor positions

## API Reference

See the main `@lexical/loro` package documentation for detailed API information.
