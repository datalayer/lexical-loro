import type {EditorState, NodeKey} from 'lexical';
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getWritableNodeState,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from 'lexical';
import { LoroEvent } from 'loro-crdt';
import {Provider} from '../State';
import {CollabDecoratorNode} from '../nodes/CollabDecoratorNode';
import {CollabElementNode} from '../nodes/CollabElementNode';
import {CollabTextNode} from '../nodes/CollabTextNode';
import {
  $syncLocalCursorPosition,
  syncCursorPositions,
  SyncCursorPositionsFn,
  syncLexicalSelectionToCRDT,
} from './SyncCursors';
import {
  $moveSelectionToPreviousNode,
  doesSelectionNeedRecovering,
  syncWithTransaction,
} from '../utils/Utils';
import { Binding } from '../Bindings';
import { AnyCollabNode } from '../nodes/AnyCollabNode';

/*****************************************************************************/

type IntentionallyMarkedAsDirtyElement = boolean;

/******************************************************************************
 * CRDT -> Lexical
 *****************************************************************************/

function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const {target, diff} = event;
  
  // Check if this is a __state related event
  if (typeof target === 'string' && target.includes('__state')) {
    
    // Find the container in the document
    const doc = binding.doc;
    const container = doc.getContainerById(target);
    
    if (!container) {
      console.warn(`⚠️ [STATE-EVENT] Container not found for: ${target}`)
      return false;
    }
    
    // Get the parent container to find the associated collabNode
    const parentPath = event.path;
    if (!parentPath || parentPath.length === 0) {
      console.warn(`⚠️ [STATE-EVENT] No path for state event: ${target}`)
      return false;
    }
    
    // Try to find the parent container and its associated collabNode
    const parentContainerId = parentPath[parentPath.length - 1];
    const collabNode = binding.collabNodeMap.get(String(parentContainerId));
    
    if (!collabNode) {
      console.warn(`⚠️ [STATE-EVENT] No CollabNode found for parent: ${parentContainerId}`)
      return false;
    }
    
    const node = collabNode.getNode();

    if (node && diff && diff.type === 'map') {
      const state = $getWritableNodeState(node.getWritable());
      const mapDiff = diff as any; // Cast to map diff type
      // Handle map diff updates
      if (mapDiff.updated) {
        for (const [key, value] of Object.entries(mapDiff.updated)) {
          if (value !== undefined) {
            state.updateFromUnknown(key, value);
          }
        }
      }
    }
    
    return true;
  }
  
  // This is NOT a __state event, so we didn't handle it
  return false;
}

function $syncEvent(binding: Binding, event: LoroEvent): void {

  if ($syncStateEvent(binding, event)) {
    return;
  }
  
  const {target} = event;
  
  // Find the CollabNode by matching container IDs
  // Unlike Y.js where event.target is the actual shared type object,
  // in Loro, event.target is a ContainerID string, so we need to find
  // the corresponding CollabNode by examining our existing CollabNode mapping
  
  let collabNode: AnyCollabNode | null = null;
  
  // First, try exact match with existing CollabNodes that have matching container IDs
  for (const [key, node] of binding.collabNodeMap.entries()) {
    // Check if the node's underlying container matches the event target
    const nodeContainer = (node as any)._xmlText || (node as any)._sharedType || (node as any)._map;
    if (nodeContainer && nodeContainer.id === target) {
      collabNode = node;
      break;
    }
  }
  
  // If no exact match, try pattern matching for element nodes
  if (!collabNode && typeof target === 'string') {
    const elementMatch = target.match(/element_(\d+)/);
    if (elementMatch) {
      const elementKey = elementMatch[1];
      collabNode = binding.collabNodeMap.get(elementKey) as any;
    }
  }
  
  // If still no match, check if this is a text node Map that needs to be created
  if (!collabNode && typeof target === 'string' && target.includes(':text_') && target.endsWith(':Map')) {
    try {
      // Extract text node key from target (e.g., "cid:root-text_3:Map" -> "text_3")
      const textNodeMatch = target.match(/text_(\d+):Map/);
      if (textNodeMatch) {
        const textNodeKey = `text_${textNodeMatch[1]}`;
        
        // Get the LoroMap for this text node
        const map = binding.doc.getMap(target);
        if (map && map.get('__type') === 'text') {
          
          // Find the parent CollabElementNode by looking for the root or other element nodes
          // that might contain this text node through embeds
          let parentCollabNode: CollabElementNode | null = null;
          
          // First try the root node
          const rootCollabNode = binding.root;
          if (rootCollabNode instanceof CollabElementNode) {
            parentCollabNode = rootCollabNode;
          }
          
          if (parentCollabNode) {
            // Check if this text node already exists in the parent's children
            const existingChild = parentCollabNode._children.find(child => 
              child instanceof CollabTextNode && 
              (child._map as any).id === target
            );
            
            if (!existingChild) {
              
              // Create the CollabTextNode
              const nodeType = map.get('__type') as string;
              const collabTextNode = new CollabTextNode(map, '', parentCollabNode, nodeType);
              
              // Add to parent's children
              parentCollabNode._children.push(collabTextNode);
              
              // Register in the collabNodeMap
              binding.collabNodeMap.set(textNodeKey, collabTextNode);
              
              // Set this as the found collabNode so the event gets processed
              collabNode = collabTextNode;
            } else {
              collabNode = existingChild;
            }
          } else {
            console.warn(`⚠️ [SYNC-TEXT-NODE] Could not find parent CollabElementNode for ${textNodeKey}`);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ [SYNC-TEXT-NODE] Error trying to create CollabTextNode for ${target}:`, error);
    }
  }
  
  // If still no match, try root node for root-related events
  if (!collabNode && typeof target === 'string' && target.includes('root')) {
    collabNode = binding.root;
  }
  
  if (!collabNode) {
    console.warn(`❌ [SYNC-EVENT-ERROR] No CollabNode found for container ID: ${target}`)
    return;
  }
  
  // Process the event with the found CollabNode
  processCollabNodeEvent(binding, collabNode, event);
}

function processCollabNodeEvent(binding: Binding, collabNode: AnyCollabNode, event: LoroEvent): void {
  const {diff} = event;
  
  if (!diff) {
    // No diff means no changes to process
    return;
  }
  
  // Handle different CollabNode types with Loro-style diff processing
  if (collabNode instanceof CollabElementNode) {
    // For element nodes, handle different diff types
    if (diff.type === 'text') {
      // Text diff: handle children changes using delta
      const textDiff = diff as any; // Cast to text diff type
      const delta = textDiff.diff;
      if (delta && Array.isArray(delta) && delta.length > 0) {
        try {
          collabNode.applyChildrenCRDTDelta(binding, delta);
          collabNode.syncChildrenFromCRDT(binding);
        } catch (error) {
          console.warn('❌ [SYNC-NODE-ERROR] Failed to apply children CRDT delta:', error);
        }
      } else {
        console.warn(`⚠️ [SYNC-NODE-8] No valid delta in text diff`)
      }
    } else if (diff.type === 'map') {
      // Map diff: handle property changes
      const mapDiff = diff as any; // Cast to map diff type
      const updated = mapDiff.updated;
      if (updated && Object.keys(updated).length > 0) {
        try {
          const keysChanged = new Set(Object.keys(updated));
          collabNode.syncPropertiesFromCRDT(binding, keysChanged);
        } catch (error) {
          console.warn('❌ [SYNC-NODE-ERROR] Failed to sync properties from CRDT:', error);
        }
      } else {
        console.warn(`⚠️ [SYNC-NODE-12] No updated properties in map diff`)
      }
    } else {
      // Fallback: sync children from CRDT
      try {
        collabNode.syncChildrenFromCRDT(binding);
      } catch (error) {
        console.warn('❌ [SYNC-NODE-ERROR] Failed to sync children from CRDT:', error);
      }
    }
  } else if (collabNode instanceof CollabTextNode) {
    // For text nodes, handle map diff (properties and text)
    if (diff.type === 'map') {
      const mapDiff = diff as any; // Cast to map diff type
      const updated = mapDiff.updated;
      if (updated && Object.keys(updated).length > 0) {
        try {
          const keysChanged = new Set(Object.keys(updated));
          collabNode.syncPropertiesAndTextFromCRDT(binding, keysChanged);
        } catch (error) {
          console.warn('Failed to sync CollabTextNode properties:', error);
        }
      }
    } else {
      // Fallback: sync properties and text
      try {
        collabNode.syncPropertiesAndTextFromCRDT(binding, null);
      } catch (error) {
        console.warn('Failed to sync CollabTextNode:', error);
      }
    }
  } else if (collabNode instanceof CollabDecoratorNode) {
    // For decorator nodes, typically handle map diff (attributes)
    if (diff.type === 'map') {
      const mapDiff = diff as any; // Cast to map diff type
      const updated = mapDiff.updated;
      if (updated && Object.keys(updated).length > 0) {
        try {
          const attributesChanged = new Set(Object.keys(updated));
          collabNode.syncPropertiesFromCRDT(binding, attributesChanged);
        } catch (error) {
          console.warn('Failed to sync CollabDecoratorNode properties:', error);
        }
      }
    } else {
      // Fallback: sync properties
      try {
        collabNode.syncPropertiesFromCRDT(binding, null);
      } catch (error) {
        console.warn('Failed to sync CollabDecoratorNode:', error);
      }
    }
  } else {
    // Handle other node types generically
    try {
      if ('syncPropertiesFromCRDT' in collabNode) {
        (collabNode as any).syncPropertiesFromCRDT(binding, null);
      }
    } catch (error) {
      console.warn('Failed to sync unknown CollabNode type:', error);
    }
  }
}

export function syncCRDTUpdatesToLexical(
  binding: Binding,
  provider: Provider,
  events: Array<LoroEvent>,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {  
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  // For Loro events, we don't need to precompute deltas like in Y.js
  // The diff is already computed and available in the event structure

  editor.update(
    () => {
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        $syncEvent(binding, event);
      }

      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        if (doesSelectionNeedRecovering(selection)) {
          const prevSelection = currentEditorState._selection;

          if ($isRangeSelection(prevSelection)) {
            $syncLocalCursorPosition(binding, provider);
            if (doesSelectionNeedRecovering(selection)) {
              // If the selected node is deleted, move the selection to the previous or parent node.
              const anchorNodeKey = selection.anchor.key;
              $moveSelectionToPreviousNode(anchorNodeKey, currentEditorState);
            }
          }

          syncLexicalSelectionToCRDT(
            binding,
            provider,
            prevSelection,
            $getSelection(),
          );
        } else {
          $syncLocalCursorPosition(binding, provider);
        }
      }

      if (!isFromUndoManger) {
        // If it is an external change, we don't want the current scroll position to get changed
        // since the user might've intentionally scrolled somewhere else in the document.
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      }
    },
    {
      onUpdate: () => {
        syncCursorPositionsFn(binding, provider);
        // If there was a collision on the top level paragraph
        // we need to re-add a paragraph. To ensure this insertion properly syncs with other clients,
        // it must be placed outside of the update block above that has tags 'collaboration' or 'historic'.
        editor.update(() => {
          if ($getRoot().getChildrenSize() === 0) {
            $getRoot().append($createParagraphNode());
          }
        });
      },
      skipTransforms: true,
      tag: isFromUndoManger ? HISTORIC_TAG : COLLABORATION_TAG,
    },
  );
}

/******************************************************************************
 * Lexical -> CRDT
 *****************************************************************************/

function $handleNormalizationMergeConflicts(
  binding: Binding,
  normalizedNodes: Set<NodeKey>,
): void {
  // We handle the merge operations here
  const normalizedNodesKeys = Array.from(normalizedNodes);
  const collabNodeMap = binding.collabNodeMap;
  const mergedNodes: [CollabTextNode, string][] = [];
  const removedNodes: CollabTextNode[] = [];

  for (let i = 0; i < normalizedNodesKeys.length; i++) {
    const nodeKey = normalizedNodesKeys[i];
    const lexicalNode = $getNodeByKey(nodeKey);
    const collabNode = collabNodeMap.get(nodeKey);

    if (collabNode instanceof CollabTextNode) {
      if ($isTextNode(lexicalNode)) {
        // We mutate the text collab nodes after removing
        // all the dead nodes first, otherwise offsets break.
        mergedNodes.push([collabNode, lexicalNode.__text]);
      } else {
        const offset = collabNode.getOffset();

        if (offset === -1) {
          continue;
        }

        const parent = collabNode._parent;
        collabNode._normalized = true;
        parent._xmlText.delete(offset, 1);

        removedNodes.push(collabNode);
      }
    }
  }

  for (let i = 0; i < removedNodes.length; i++) {
    const collabNode = removedNodes[i];
    const nodeKey = collabNode.getKey();
    collabNodeMap.delete(nodeKey);
    const parentChildren = collabNode._parent._children;
    const index = parentChildren.indexOf(collabNode);
    parentChildren.splice(index, 1);
  }

  for (let i = 0; i < mergedNodes.length; i++) {
    const [collabNode, text] = mergedNodes[i];
    collabNode._text = text;
  }
}

export function syncLexicalUpdatesToCRDT(
  binding: Binding,
  provider: Provider,
  prevEditorState: EditorState,
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>,
): void {
  syncWithTransaction(binding, () => {
    currEditorState.read(() => {
      // We check if the update has come from a origin where the origin
      // was the collaboration binding previously. This can help us
      // prevent unnecessarily re-diffing and possible re-applying
      // the same change editor state again. For example, if a user
      // types a character and we get it, we don't want to then insert
      // the same character again. The exception to this heuristic is
      // when we need to handle normalization merge conflicts.
      
      // CRITICAL FIX: Check for initial sync scenario
      const lexicalRoot = $getRoot();
      const crdtRoot = binding.root;
      const isInitialSyncNeeded = crdtRoot.isEmpty() && 
                                  crdtRoot.getSharedType()?.length === 0 && 
                                  lexicalRoot.getChildren().length > 0;
      
      if ((tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) && !isInitialSyncNeeded) {
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }
        return;
      } else if (isInitialSyncNeeded) {
        console.log('🔄 [SyncLexicalUpdateToCRDT] FORCING INITIAL SYNC - CRDT empty but Lexical has content', {
          crdtRootIsEmpty: crdtRoot.isEmpty(),
          crdtRootLength: crdtRoot.getSharedType()?.length,
          lexicalRootChildrenCount: lexicalRoot.getChildren().length,
          hasCollabTag: tags.has(COLLABORATION_TAG),
          hasHistoricTag: tags.has(HISTORIC_TAG)
        });
      }

      if (dirtyElements.has('root')) {
        const prevNodeMap = prevEditorState._nodeMap;
        const nextLexicalRoot = $getRoot();
        const collabRoot = binding.root;
        collabRoot.syncPropertiesFromLexical(
          binding,
          nextLexicalRoot,
          prevNodeMap,
        );
        collabRoot.syncChildrenFromLexical(
          binding,
          nextLexicalRoot,
          prevNodeMap,
          dirtyElements,
          dirtyLeaves,
        );
      }

      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      syncLexicalSelectionToCRDT(binding, provider, prevSelection, selection);
    });
  });
}