import type {LexicalEditor, NodeKey} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc} from 'loro-crdt';
import type {CollabElementNode} from './nodes/CollabElementNode';
import {$createCollabElementNode} from './nodes/CollabElementNode';
import { AnyCollabNode } from './nodes/AnyCollabNode';
import invariant from '../utils/invariant';
import type {Cursor} from './sync/SyncCursors';
import {XmlText} from './types/XmlText';
import {Provider} from './State';

export type ClientID = number;

export type Binding = {
  clientID: ClientID;
  collabNodeMap: Map<NodeKey, AnyCollabNode>;
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
  
  const collabRoot: CollabElementNode = $createCollabElementNode(
    rootXmlText,
    null,
    'root',
  );
  collabRoot._key = 'root';
  
  const binding = {
//    clientID: doc.peerId,
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
    root: collabRoot,
  };  

  return binding;
}
