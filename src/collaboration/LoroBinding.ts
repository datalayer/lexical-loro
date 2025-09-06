/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalEditor, NodeKey } from 'lexical';
import type { LoroDoc, LoroTree, TreeID, Cursor } from 'loro-crdt';
import type { LoroCollabNode } from './nodes/LoroCollabNode';
import { LoroCollabElementNode } from './nodes/LoroCollabElementNode';

export type ClientID = string;

// Provider interface (matching YJS Provider pattern)
export interface LoroProvider {
  doc: LoroDoc;
  connected: boolean;
  awareness?: any; // Loro equivalent of YJS awareness
  connect?(): void | Promise<void>;
  disconnect?(): void;
}

// Cursor interface (matching YJS cursor pattern)
export interface LoroCollabCursor {
  cursor: Cursor | null; // Loro cursor (equivalent to YJS RelativePosition)
  selection: any;
  name: string;
  color: string;
}

// Main binding interface (following YJS Binding pattern)
export interface LoroBinding {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, LoroCollabNode>; // Maps Lexical nodes to Loro collab nodes
  cursors: Map<ClientID, LoroCollabCursor>; // User cursors
  cursorsContainer: HTMLElement | null; // Container for cursor rendering
  doc: LoroDoc; // Loro document
  docMap: Map<string, LoroDoc>; // Document registry
  editor: LexicalEditor; // Lexical editor instance
  ephemeral: Record<ClientID, any> | null; // Ephemeral store (equivalent to YJS awareness)
  id: string; // Binding identifier
  root: LoroCollabElementNode; // Root collaboration node
  rootTree: LoroTree; // Loro tree (equivalent to YJS XmlText)
  rootTreeId: TreeID; // Tree identifier
  excludedProperties: Map<any, Set<string>>; // Properties to exclude from sync
}

/**
 * Create a Loro binding (equivalent to YJS createBinding)
 * 
 * This function creates the bridge between Lexical editor and Loro CRDT,
 * following the same pattern as YJS bindings:
 * 
 * YJS Pattern:                 Loro Equivalent:
 * - XmlText (hierarchical)  -> LoroTree (hierarchical)
 * - RelativePosition        -> Cursor (position tracking)  
 * - Awareness              -> Ephemeral store (presence)
 * - Provider               -> WebSocket + LoroDoc
 * - Binding                -> LoroBinding (this interface)
 */
export function createLoroBinding(
  editor: LexicalEditor,
  provider: LoroProvider,
  id: string,
  doc: LoroDoc,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: Map<any, Set<string>>
): LoroBinding {
  console.log('🔗 Creating Loro binding with tree-based collaboration');
  
  // Get or create the root tree container in Loro document 
  // This is equivalent to YJS XmlText but uses Loro's Tree structure
  // which supports hierarchical document editing
  const rootTreeId = 'document' as TreeID;
  const rootTree = doc.getTree(rootTreeId);
  
  // Create the root collaboration element node
  // This represents the document root in the collaboration layer
  const root = new LoroCollabElementNode(rootTree, null, 'root', 'document');
  root._key = 'root';

  console.log('🌳 Loro binding created:');
  console.log('  - Tree ID:', rootTreeId);
  console.log('  - Client ID:', doc.peerIdStr);
  console.log('  - Editor:', editor.constructor.name);

  return {
    clientID: doc.peerIdStr, // Use Loro's peer ID as client identifier
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    ephemeral: {}, // Initialize ephemeral store for user awareness
    id,
    root,
    rootTree,
    rootTreeId,
    excludedProperties: excludedProperties || new Map(),
  };
}

/**
 * Initialize local awareness state (equivalent to YJS initLocalState)
 * 
 * Sets up the user's presence information in the collaboration system
 */
export function initLoroLocalState(
  provider: LoroProvider,
  name: string,
  color: string,
  focusing: boolean,
  awarenessData: object,
): void {
  console.log('👤 Initializing local state:', { name, color, focusing });
  
  // TODO: Implement with Loro ephemeral store when available
  // For now, this is a placeholder that matches the YJS pattern
  if (provider.awareness) {
    provider.awareness.setLocalState({
      anchorPos: null,
      awarenessData,
      color,
      focusPos: null,
      focusing: focusing,
      name,
    });
  }
}

/**
 * Set local focus state (equivalent to YJS setLocalStateFocus)
 * 
 * Updates the user's focus state in the awareness system
 */
export function setLoroLocalStateFocus(
  provider: LoroProvider,
  name: string,
  color: string,
  focusing: boolean,
  awarenessData: object,
): void {
  console.log('👁️ Setting focus state:', focusing);
  
  // TODO: Implement with Loro ephemeral store when available
  if (provider.awareness) {
    let localState = provider.awareness.getLocalState();
    
    if (localState === null) {
      localState = {
        anchorPos: null,
        awarenessData,
        color,
        focusPos: null,
        focusing: focusing,
        name,
      };
    }
    
    localState.focusing = focusing;
    provider.awareness.setLocalState(localState);
  }
}
