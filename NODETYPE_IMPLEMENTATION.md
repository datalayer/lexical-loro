# NodeType Implementation Summary

## Overview
This implementation ensures bidirectional synchronization between Lexical nodes and Loro tree nodes using `nodeType` data for proper node creation.

## Key Components

### 1. Lexical → Loro Direction (Node Creation)

**Where**: All mutator files (`*NodeMutators.ts`)
**Implementation**: Each mutator sets `nodeType` when creating Loro tree nodes

```typescript
// Example from TextNodeMutators.ts
treeNode.data.set('nodeType', 'text');

// Example from ElementNodeMutators.ts  
treeNode.data.set('nodeType', 'element');

// Example from RootNodeMutators.ts
treeNode.data.set('nodeType', 'root');
```

### 2. Loro → Lexical Direction (Node Creation)

**Where**: `NodeFactory.ts` and `SyncLoroToLexical.ts`
**Implementation**: 

1. **NodeFactory** reads `nodeType` from Loro tree node data and dispatches to appropriate mutator:

```typescript
const nodeType = treeNode?.data.get('nodeType');
switch (nodeType) {
  case 'root': return createRootNodeFromLoro(...);
  case 'element': return createElementNodeFromLoro(...);
  case 'text': return createTextNodeFromLoro(...);
  // etc.
}
```

2. **SyncLoroToLexical** uses NodeFactory when Loro tree changes occur:

```typescript
case 'create': {
  const lexicalNode = createLexicalNodeFromLoro(
    treeChange.target,
    tree,
    parentLexicalNode,
    treeChange.index,
    { tree, binding, provider }
  );
}
```

### 3. NodeMapper Integration

**Where**: `Bindings.ts`, `NodesMapper.ts`
**Implementation**:

1. **Binding** includes NodeMapper instance:
```typescript
export type Binding = {
  // ... other properties
  nodeMapper: NodeMapper;
};
```

2. **NodeMapper** automatically stores `nodeType` when creating tree nodes:
```typescript
if (lexicalNode) {
  treeNode.data.set('nodeType', lexicalNode.getType());
}
```

## Data Flow

### Lexical Node Creation → Loro Tree Node
1. User creates/edits Lexical node
2. `SyncLexicalToLoro` detects mutation
3. Appropriate mutator called (e.g., `mutateTextNode`)
4. Mutator calls `NodeMapper.getLoroNodeByLexicalKey()`
5. NodeMapper creates Loro tree node with `nodeType` data
6. Mutator adds additional node-specific metadata

### Loro Tree Node Creation → Lexical Node
1. Loro tree change detected (e.g., from collaboration)
2. `SyncLoroToLexical` processes tree diff
3. `NodeFactory.createLexicalNodeFromLoro()` called
4. Factory reads `nodeType` from tree node data
5. Factory dispatches to appropriate `create*FromLoro()` mutator
6. Mutator creates and configures Lexical node
7. Node inserted into Lexical editor at correct position

## Node Types Supported
- `'root'` → RootNode
- `'element'` → ElementNode (paragraphs, headings, etc.)
- `'text'` → TextNode  
- `'linebreak'` → LineBreakNode
- `'decorator'` → DecoratorNode

## Benefits
1. **Type Safety**: NodeFactory ensures correct node types are created
2. **Extensibility**: Easy to add new node types by adding cases to switch statement
3. **Bidirectional Sync**: Proper synchronization in both directions
4. **No Circular Dependencies**: Factory pattern eliminates dynamic imports
5. **Consistent Data**: `nodeType` ensures reliable node reconstruction

## Files Modified
- ✅ `NodeFactory.ts` - Central node creation factory
- ✅ `NodesMapper.ts` - Bidirectional mapping with nodeType storage
- ✅ `Bindings.ts` - NodeMapper integration
- ✅ `SyncLoroToLexical.ts` - Uses NodeFactory for node creation
- ✅ All `*NodeMutators.ts` - Set nodeType in data