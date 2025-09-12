/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

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
import invariant from '../../utils/invariant';
import {
  LoroMap,
  LoroEvent,
} from 'loro-crdt';

import {XmlText} from '../types/XmlText';
import {Binding, Provider} from '../State';
import {CollabDecoratorNode} from '../nodes/CollabDecoratorNode';
import {CollabElementNode} from '../nodes/CollabElementNode';
import {CollabLineBreakNode} from '../nodes/CollabLineBreakNode';
import {CollabTextNode} from '../nodes/CollabTextNode';
import {
  $syncLocalCursorPosition,
  AnyCollabNode,
  syncCursorPositions,
  SyncCursorPositionsFn,
  syncLexicalSelectionToCRDT,
} from './SyncCursors';
import {
  $getOrInitCollabNodeFromSharedType,
  $moveSelectionToPreviousNode,
  doesSelectionNeedRecovering,
  getNodeTypeFromSharedType,
  syncWithTransaction,
} from '../Utils';

// For Loro, state events are events that target __state containers
// This handles node state synchronization for properties stored in nested containers
function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const target = event.target;
  const eventData = event as any;
  
  // Check if this is a state-related event
  // In Loro, state events would have targets ending with "__state" or containing state paths
  if (typeof target === 'string' && target.includes('__state')) {
    console.log('$syncStateEvent: Processing state event:', target, event);
    
    // Extract parent container ID from the state target
    // Pattern: cid:root-someContainer__state:Map -> parent is someContainer
    const stateMatch = target.match(/^cid:(.+)__state:Map$/);
    if (!stateMatch) {
      return false;
    }
    
    const parentContainerId = stateMatch[1];
    
    // Find the collaboration node that owns this state
    for (const [sharedType, collabNode] of binding.collabNodeMap.entries()) {
      // Match the collaboration node by its container pattern
      if (collabNode._key && parentContainerId.includes(collabNode._key)) {
        const node = collabNode.getNode();
        if (node && eventData.diff) {
          const state = $getWritableNodeState(node.getWritable());
          // Update state properties from the diff
          for (const key in eventData.diff) {
            const value = eventData.diff[key];
            state.updateFromUnknown(key, value);
          }
          console.log('$syncStateEvent: Updated node state for', collabNode._key, eventData.diff);
          return true;
        }
      }
    }
    
    console.warn('$syncStateEvent: Could not find collaboration node for state target:', target);
    return false;
  }
  
  return false;
}

function $syncEvent(binding: Binding, event: LoroEvent): void {
  // First check if this is a state event that should be handled specially
  if ($syncStateEvent(binding, event)) {
    return;
  }
  
  // For Loro events, we need to handle the different event structure
  // LoroEvent has properties like: target (string), diff, path, etc.
  const target = event.target;
  
  // Handle container ID strings - these are the actual document containers we need to process
  if (typeof target === 'string') {
    console.log('$syncEvent: Processing container ID event:', target, event);
    
    // Extract the container ID pattern: cid:root-something:Type
    const match = target.match(/^cid:(.+):(\w+)$/);
    if (!match) {
      console.warn('$syncEvent: Invalid container ID format:', target);
      return;
    }
    
    const [, containerId, containerType] = match;
    
    // Find existing collaboration node by matching key patterns
    let foundCollabNode;
    
    // Search through existing collaboration nodes
    for (const [sharedType, collabNode] of binding.collabNodeMap.entries()) {
      // Match based on container patterns
      if (containerId === 'root-root' && collabNode._key === 'root') {
        foundCollabNode = collabNode;
        break;
      } else if (containerId.includes('element_') && collabNode._key) {
        // Extract element key from container ID
        const elementMatch = containerId.match(/element_(\w+)/);
        if (elementMatch && collabNode._key === elementMatch[1]) {
          foundCollabNode = collabNode;
          break;
        }
      } else if (containerId.includes('text_') && collabNode._key) {
        // Extract text key from container ID  
        const textMatch = containerId.match(/text_(\w+)/);
        if (textMatch && collabNode._key === textMatch[1]) {
          foundCollabNode = collabNode;
          break;
        }
      }
    }
    
    if (foundCollabNode) {
      console.log('$syncEvent: Found existing collab node for', target, ':', foundCollabNode);
      processCollabNodeEvent(binding, foundCollabNode, event);
      return;
    }
    
    console.warn('$syncEvent: Could not find collaboration node for container ID:', target);
    return;
  }
  
  // If target is not a string, it should be a shared type object
  if (target && typeof target === 'object') {
    const collabNode = $getOrInitCollabNodeFromSharedType(binding, target);

    // Skip processing if collabNode is null (raw Loro container without __type)
    if (!collabNode) {
      const targetTypeName = (target as any)?.constructor?.name || 'unknown';
      console.warn('$syncEvent: Skipping event for raw Loro container:', targetTypeName, 'Event:', event);
      return;
    }
    
    processCollabNodeEvent(binding, collabNode, event);
    return;
  }
  
  console.warn('$syncEvent: Unhandled target type:', typeof target, target);
}

function processCollabNodeEvent(binding: Binding, collabNode: AnyCollabNode, event: LoroEvent): void {
  // For Loro events, we need to handle the different event structure
  // LoroEvent has properties like: target, diff, path, etc.
  const eventData = event;
  
  if (collabNode instanceof CollabElementNode) {
    // For element nodes, handle structure changes
    if (eventData.diff) {
      // Handle diff-based updates for Loro
      collabNode.syncChildrenFromCRDT(binding);
    }
  } else if (collabNode instanceof CollabTextNode) {
    // For text nodes, handle text content changes
    if (eventData.diff) {
      // Handle text diff updates
      collabNode.syncPropertiesAndTextFromCRDT(binding, new Set(['__text']));
    }
  } else if (collabNode instanceof CollabDecoratorNode) {
    // For decorator nodes, handle property changes
    if (eventData.diff) {
      // Handle property updates
      collabNode.syncPropertiesFromCRDT(binding, new Set(Object.keys(eventData.diff)));
    }
  } else if (collabNode instanceof CollabLineBreakNode) {
    // For line break nodes, typically no content changes needed
    console.debug('processCollabNodeEvent: Line break node event processed');
  } else {
    const nodeType = (collabNode as any)?.constructor?.name || 'unknown';
    console.warn('processCollabNodeEvent: Unknown collaboration node type:', nodeType);
  }
}

export function syncCRDTChangesToLexical(
  binding: Binding,
  provider: Provider,
  events: Array<LoroEvent>,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  // For Loro events, diff information is already computed
  // No need for pre-computation like in Y.js
  events.forEach((event) => {
    const eventData = event as any;
    if (eventData.diff) {
      // Loro diffs are already available, no pre-computation needed
      console.debug('Event has diff:', eventData.diff);
    }
  });

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

type IntentionallyMarkedAsDirtyElement = boolean;

export function syncLexicalUpdateToCRDT(
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
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }

        return;
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
