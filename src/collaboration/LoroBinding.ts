/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalEditor, NodeKey } from 'lexical';
import type { LoroDoc, LoroTree, TreeID, Cursor, LoroText, LoroMap } from 'loro-crdt';
import type { LoroCollabNode } from './nodes/LoroCollabNode';
import type { LoroProvider } from './LoroProvider';
import { LoroCollabElementNode } from './nodes/LoroCollabElementNode';

export type ClientID = string;
export type LoroTreeNode = { 
  id: TreeID; 
  parent: TreeID | undefined; 
  index: number; 
  fractionalIndex: string; 
  meta: LoroMap; 
};

// Awareness interface (equivalent to YJS awareness)
export interface LoroAwareness {
  getLocalState(): LoroUserState | null;
  getStates(): Map<ClientID, LoroUserState>;
  setLocalState(state: LoroUserState): void;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'update', callback: () => void): void;
  off(event: 'update', callback: () => void): void;
}

// User state interface (equivalent to YJS UserState)
export interface LoroUserState {
  anchorCursor: Cursor | null; // Loro cursor (equivalent to YJS RelativePosition)
  focusCursor: Cursor | null;  // Loro cursor for selection end
  color: string;
  name: string;
  focusing: boolean;
  awarenessData: object;
  [key: string]: unknown;
}

// Cursor selection interface (matching YJS cursor pattern)
export interface LoroCollabCursor {
  cursor: Cursor | null; 
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
  ephemeral: Record<ClientID, any>; // Ephemeral state store (equivalent to YJS awareness)
  id: string; // Binding identifier
  root: LoroCollabElementNode; // Root collaboration node
  rootTree: LoroTree; // Loro tree (equivalent to YJS XmlText)
  rootText: LoroText; // Primary text container for document content
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
 * - Awareness              -> LoroAwareness (presence)
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
  const rootTree = doc.getTree('document');
  
  // Create primary text container for document content
  // This stores the actual text content like YJS Text
  const rootText = doc.getText('content');
  
  // Create the root collaboration element node
  // This represents the document root in the collaboration layer
  const root = new LoroCollabElementNode(rootTree, null, 'root', 'document');
  root._key = 'root';

  console.log('🌳 Loro binding created:');
  console.log('  - Tree for structure, Text for content');
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
    ephemeral: {}, // Initialize ephemeral state store for awareness
    id,
    root,
    rootTree,
    rootText,
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
  
  if (provider.awareness) {
    provider.awareness.setLocalState({
      anchorCursor: null,
      focusCursor: null,
      awarenessData,
      color,
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
  
  if (provider.awareness) {
    let localState = provider.awareness.getLocalState();
    
    if (localState === null) {
      localState = {
        anchorCursor: null,
        focusCursor: null,
        awarenessData,
        color,
        focusing: focusing,
        name,
      };
    } else {
      localState.focusing = focusing;
    }
    
    provider.awareness.setLocalState(localState);
  }
}
