import type {LexicalEditor} from 'lexical';
import {Klass, LexicalNode} from 'lexical';
import type {LoroDoc, LoroTree} from 'loro-crdt';
import invariant from '../utils/invariant';
import type {CollabCursor} from './sync/SyncCursors';
import { getLoroTree, generateClientID } from './utils/Utils';
import { NodeMapper, initializeNodeMapper } from './nodes/NodesMapper';
import {Provider} from './State';
import { setupLoroDebugging } from './Debug';
import { isDebugEnabled } from '../../appSettings';

export type ClientID = number;

export type Binding = {
  tree: LoroTree;
  clientID: ClientID;
  cursors: Map<ClientID, CollabCursor>;
  cursorsContainer: null | HTMLElement;
  doc: LoroDoc;
  docMap: Map<string, LoroDoc>;
  editor: LexicalEditor;
  id: string;
  nodeProperties: Map<string, Array<string>>;
  excludedProperties: ExcludedProperties;
  nodeMapper: NodeMapper;
  // Async commit properties
  commitTimeout?: NodeJS.Timeout | null;
  pendingCommit?: boolean;
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
  
  // Initialize the tree - content will come from server snapshot via sync
  const tree = getLoroTree(doc);
  console.log('📄 Loro tree initialized, content will be populated via server sync');
  
  const clientID = generateClientID(doc);
  
  console.log('🏗️ BINDING DEBUG - Creating binding:', {
    bindingId: id,
    localPeerId: doc.peerId,
    generatedClientID: clientID,
    docPeerIdType: typeof doc.peerId,
    awarenessKey: clientID.toString()
  });

  const binding: Binding = {
    clientID: clientID,
    cursors: new Map(),
    cursorsContainer: null,
    doc,
    docMap,
    editor,
    tree,
    excludedProperties: excludedProperties || new Map(),
    id,
    nodeProperties: new Map(),
    nodeMapper: null as any, // Will be initialized below
    // Initialize async commit properties
    commitTimeout: null,
    pendingCommit: false,
  };

  // Initialize the NodeMapper with the binding
  binding.nodeMapper = initializeNodeMapper(binding);

  // Setup debugging utilities only if debug is enabled via URL parameter
  if (isDebugEnabled()) {
    setupLoroDebugging(binding);
    console.log('🐛 Loro debugging enabled via ?debug=true URL parameter');
  }

  return binding;
}

/**
 * Schedules an asynchronous commit for the binding to reduce latency with large documents.
 * Uses debouncing to prevent excessive commits during rapid mutations.
 * 
 * @param binding - The binding to commit
 * @param delay - Debounce delay in milliseconds (default: 100ms)
 */
export function scheduleAsyncCommit(binding: Binding, delay: number = 500): void {
  // Clear any existing timeout
  if (binding.commitTimeout) {
    clearTimeout(binding.commitTimeout);
  }
  
  // Mark that we have pending changes
  binding.pendingCommit = true;
  
  // Schedule the commit after the specified delay
  binding.commitTimeout = setTimeout(() => {
    if (binding.pendingCommit) {
      try {
        // Perform the actual commit
        binding.doc.commit({ origin: binding.doc.peerIdStr });
        console.log('🔄 Async commit completed for binding:', binding.id);
      } catch (error) {
        console.error('❌ Async commit failed for binding:', binding.id, error);
      }
      
      // Reset pending state
      binding.pendingCommit = false;
    }
    binding.commitTimeout = null;
  }, delay);
}

/**
 * Forces an immediate commit if there are pending changes.
 * Useful for ensuring changes are committed before important operations.
 * 
 * @param binding - The binding to commit
 */
export function flushPendingCommit(binding: Binding): void {
  if (binding.commitTimeout) {
    clearTimeout(binding.commitTimeout);
    binding.commitTimeout = null;
  }
  
  if (binding.pendingCommit) {
    binding.doc.commit({ origin: binding.doc.peerIdStr });
    binding.pendingCommit = false;
    console.log('🔄 Forced commit completed for binding:', binding.id);
  }
}

// Export components
export { LoroCollaborators, type LoroCollaboratorsProps, LoroCollaborationUI, type LoroCollaborationUIProps } from './components';

// Export debug utilities for development use
export { setupLoroDebugging, addDebugPanel, logTreeStructure, verifyTreeStructure } from './Debug';
