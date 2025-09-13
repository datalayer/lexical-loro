/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {LexicalEditor, NodeKey} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc} from 'loro-crdt';
import type {CollabDecoratorNode} from './nodes/CollabDecoratorNode';
import type {CollabElementNode} from './nodes/CollabElementNode';
import type {CollabLineBreakNode} from './nodes/CollabLineBreakNode';
import type {CollabTextNode} from './nodes/CollabTextNode';
import {$createCollabElementNode} from './nodes/CollabElementNode';
import invariant from '../utils/invariant';
import type {Cursor} from './sync/SyncCursors';
import {XmlText} from './types/XmlText';
import {Provider} from './State';

export type ClientID = number;
export type Binding = {
  clientID: number;
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
  provider: Provider,
  id: string,
  doc: LoroDoc | null | undefined,
  docMap: Map<string, LoroDoc>,
  excludedProperties?: ExcludedProperties,
): Binding {
  console.log(`[CreateBinding] STARTING binding creation:`, {
    editorHasRootElement: !!editor.getRootElement(),
    docId: id,
    hasDoc: !!doc,
    docPeerId: doc?.peerId?.toString()
  });
  
  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );
  
  console.log(`[CreateBinding] Creating root XmlText`);
  const rootXmlText = new XmlText(doc, 'root');
  rootXmlText.setAttribute('__type', 'root');
  console.log(`[CreateBinding] Created root XmlText:`, {
    rootXmlTextLength: rootXmlText.length,
    rootXmlTextIsEmpty: rootXmlText.length === 0,
    rootXmlTextType: rootXmlText.getAttribute('__type')
  });
  
  console.log(`[CreateBinding] Creating root CollabElementNode`);
  const root: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  root._key = 'root';
  console.log(`[CreateBinding] Created root CollabElementNode:`, {
    rootKey: root._key,
    rootType: root.getType(),
    rootHasSharedType: !!root.getSharedType(),
    rootSharedTypeLength: root.getSharedType()?.length
  });
  
  const binding = {
    clientID: Number(doc.peerId.toString().slice(0, 8)), // Convert Loro peer ID to number
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
  
  // CRITICAL: We need to register the root CollabElementNode in the collabNodeMap
  // This is essential for the sync system to work
  console.log(`[CreateBinding] Registering root CollabElementNode in collabNodeMap with key 'root'`);
  binding.collabNodeMap.set('root', root);
  
  // ADDITIONAL CRITICAL FIX: Also register the root with the shared type mapping
  // This ensures that when CRDT events come in for the root container, they find the right CollabElementNode
  console.log(`[CreateBinding] Also registering root in collabNodeMap with sharedType as key`);
  binding.collabNodeMap.set(rootXmlText, root);
  
  console.log(`[CreateBinding] COMPLETED binding creation:`, {
    bindingClientID: binding.clientID,
    bindingId: binding.id,
    collabNodeMapSize: binding.collabNodeMap.size,
    hasRootInBinding: !!binding.root,
    rootRegisteredInMap: binding.collabNodeMap.has('root')
  });
  
  return binding;
}
