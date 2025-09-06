/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalEditor, NodeKey } from 'lexical';
import type { LoroDoc, LoroText } from 'loro-crdt';
import type { LoroCollabNode } from './nodes/LoroCollabNode';
import { LoroCollabElementNode } from './nodes/LoroCollabElementNode';

export type ClientID = string;

export interface LoroProvider {
  // Minimal interface for now to avoid circular dependencies
  doc: LoroDoc;
  connected: boolean;
}

export interface LoroBinding {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, LoroCollabNode>;
  cursors: Map<ClientID, any>; // TODO: Define proper cursor type
  cursorsContainer: HTMLElement | null;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  root: LoroCollabElementNode;
  rootText: LoroText;
  excludedProperties: Map<any, Set<string>>; // TODO: Define proper excluded properties type
}

export function createLoroBinding(
  editor: LexicalEditor,
  provider: LoroProvider,
  id: string,
  doc: LoroDoc,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: Map<any, Set<string>>
): LoroBinding {
  // Get or create the root text container in Loro document
  const rootText = doc.getText('root');
  
  // Create the root collaboration element node
  const root = new LoroCollabElementNode(rootText, null, 'root');
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
    rootText,
    excludedProperties: excludedProperties || new Map(),
  };
}
