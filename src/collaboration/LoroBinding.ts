/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalEditor, NodeKey } from 'lexical';
import type { LoroDoc, LoroTree, TreeID, Cursor } from 'loro-crdt';
import type { LoroCollabNode } from './nodes/LoroCollabNode';
import { LoroCollabElementNode } from './nodes/LoroCollabElementNode';

export type ClientID = string;

export interface LoroProvider {
  // Minimal interface for now to avoid circular dependencies
  doc: LoroDoc;
  connected: boolean;
}

export interface LoroCollabCursor {
  cursor: Cursor;
  selection: any;
  name: string;
  color: string;
}

export interface LoroBinding {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, LoroCollabNode>;
  cursors: Map<ClientID, LoroCollabCursor>;
  cursorsContainer: HTMLElement | null;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  root: LoroCollabElementNode;
  rootTree: LoroTree; // Use Tree instead of Text for hierarchical structure
  rootTreeId: TreeID;
  ephemeral: any; // Loro ephemeral store for awareness (equivalent to YJS awareness)
  excludedProperties: Map<any, Set<string>>;
}

export function createLoroBinding(
  editor: LexicalEditor,
  provider: LoroProvider,
  id: string,
  doc: LoroDoc,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: Map<any, Set<string>>
): LoroBinding {
  // Get or create the root tree container in Loro document (equivalent to YJS XmlText)
  const rootTreeId = 'document' as TreeID;
  const rootTree = doc.getTree(rootTreeId);
  
  // Create ephemeral container for awareness (equivalent to YJS awareness)
  // For now, we'll use a simple object until proper ephemeral API is available
  const ephemeral = {}; // TODO: Use doc.getEphemeralContainer() when available
  
  // Create the root collaboration element node
  const root = new LoroCollabElementNode(rootTree, null, 'root', 'document');
  root._key = 'root';

  return {
    clientID: doc.peerIdStr,
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    id,
    root,
    rootTree,
    rootTreeId,
    ephemeral,
    excludedProperties: excludedProperties || new Map(),
  };
}
