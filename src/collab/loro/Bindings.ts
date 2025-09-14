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

  invariant(
    doc !== undefined && doc !== null,
    'createBinding: doc is null or undefined',
  );
  
  const rootXmlText = new XmlText(doc, 'root');
  rootXmlText.setAttribute('__type', 'root');
  
  const root: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  root._key = 'root';
  
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
  binding.collabNodeMap.set('root', root);
  
  // ADDITIONAL CRITICAL FIX: Also register the root with the shared type mapping
  // This ensures that when CRDT events come in for the root container, they find the right CollabElementNode
  binding.collabNodeMap.set(root.getSharedType(), root);
  binding.collabNodeMap.set(rootXmlText, root);
  
  return binding;
}
