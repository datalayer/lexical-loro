import type {LexicalEditor} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc, LoroTree} from 'loro-crdt';
import invariant from '../utils/invariant';
import type {Cursor} from './sync/SyncCursors';
import { createLoroTree } from './utils/Utils';
import { NodeMapper, initializeNodeMapper } from './nodes/NodesMapper';
import {Provider} from './State';

export type ClientID = number;

export type Binding = {
  tree: LoroTree;
  clientID: ClientID;
  cursors: Map<ClientID, Cursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  excludedProperties: ExcludedProperties;
  nodeMapper: NodeMapper;
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
  
  const binding: Binding = {
//    clientID: doc.peerId,
    clientID: Number(doc.peerIdStr.slice(0, 8)), // Convert Loro peer ID to number
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    tree: createLoroTree(doc),
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    nodeMapper: null as any, // Will be initialized below
  };

  // Initialize the NodeMapper with the binding
  binding.nodeMapper = initializeNodeMapper(binding);  

  return binding;
}
