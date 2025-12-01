/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {LexicalEditor, NodeKey} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {Doc} from 'yjs';
import {XmlText} from 'yjs';
import invariant from '../utils/invariant';
import type {CollabElementNode} from './nodes/CollabElementNode';
import {$createCollabElementNode} from './nodes/CollabElementNode';
import { AnyCollabNode } from './nodes/AnyCollabNode';
import type {Cursor} from './sync/SyncCursors';
import {Provider} from './State';
import { setupYjsDebugging } from './Debug';

export type ClientID = number;

export type Binding = {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, AnyCollabNode>;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: Doc;
  docMap: Map<string, Doc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  root: CollabElementNode;
  excludedProperties: ExcludedProperties;
};

export type ExcludedProperties = Map<Klass<LexicalNode>, Set<string>>;

export function createBinding(
  editor: LexicalEditor,
  provider: Provider,
  id: string,
  doc: Doc | null | undefined,
  docMap: Map<string, Doc>,
  excludedProperties?: ExcludedProperties,
): Binding {

  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );

  const rootXmlText = doc.get('root', XmlText) as XmlText;

  const collabRoot: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  collabRoot._key = 'root';

  const binding = {
    clientID: doc.clientID,
    collabNodeMap: new Map(),
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    root: collabRoot,
  };

  // Setup Y.js debugging utilities
  setupYjsDebugging(binding);

  return binding
}
