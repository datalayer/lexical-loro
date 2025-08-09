/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {LexicalEditor, NodeKey} from 'lexical';

import {Klass, LexicalNode} from 'lexical';
import { LoroDoc, LoroText as LoroTextType,UndoManager } from 'loro-crdt';
import invariant from './shared/invariant';

import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabElementNode} from './CollabElementNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabTextNode} from './CollabTextNode';

export interface CursorSelection {
  anchor: {
    key: NodeKey;
    offset: number;
  };
  caret: HTMLElement;
  color: string;
  focus: {
    key: NodeKey;
    offset: number;
  };
  name: HTMLSpanElement;
  selections: Array<HTMLElement>;
}

export interface Cursor {
  color: string;
  name: string;
  selection: null | CursorSelection;
}

export type ClientID = string;

// Re-export types from loro-crdt for convenience
export type LoroText = LoroTextType;
export type LoroUndoManager = UndoManager;

export interface LoroMap {
  // Simplified LoroMap interface
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export type Binding = {
  clientID: bigint;
  collabNodeMap: Map<
    NodeKey,
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode
  >;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  root: CollabElementNode;
  excludedProperties: ExcludedProperties;
};
export type ExcludedProperties = Map<Klass<LexicalNode>, Set<string>>;

export function createBinding(
  editor: LexicalEditor,
  provider: any, // Temporarily use any to avoid circular import
  id: string,
  doc: LoroDoc,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: ExcludedProperties,
): Binding {
  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );
  
  const root: CollabElementNode = {
    _key: 'root',
  } as CollabElementNode;
  
  return {
    clientID: doc.peerId ?? -1,
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    root,
  };
}
