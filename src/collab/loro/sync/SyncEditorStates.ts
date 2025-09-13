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
import {CollabTextNode} from '../nodes/CollabTextNode';
import {
  $syncLocalCursorPosition,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function $syncStateEvent(binding: Binding, event: any): boolean {
  const {target} = event;
  if (
    !(
      target &&
      (target as any)._container &&
      (target as any)._container.parentSub === '__state' &&
      getNodeTypeFromSharedType(target) === undefined &&
      (target.parent instanceof XmlText ||
        target.parent instanceof LoroMap)
    )
  ) {
    // TODO there might be a case to handle in here when a LoroMap
    // is used as a value of __state? It would probably be desirable
    // to mark the node as dirty when that happens.
    return false;
  }
  const collabNode = $getOrInitCollabNodeFromSharedType(binding, target.parent);
  const node = collabNode.getNode();
  if (node) {
    const state = $getWritableNodeState(node.getWritable());
    for (const k of (event as any).keysChanged || []) {
      state.updateFromUnknown(k, target.get(k));
    }
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function $syncEvent(binding: Binding, event: any): void {
  // Debug: Log all events to understand what we're receiving
  console.log('$syncEvent: Received event:', {
    target: event.target,
    targetType: typeof event.target,
    eventKeys: Object.keys(event),
    isMapEvent: (event as any).isMapEvent,
    isTextEvent: (event as any).isTextEvent,
    isXmlEvent: (event as any).isXmlEvent
  });
  
  if ((event as any).isMapEvent && $syncStateEvent(binding, event)) {
    return;
  }
  const {target} = event;
  
  // Handle container ID strings - these are the actual document containers we need to process
  if (typeof target === 'string') {
    console.log('$syncEvent: Processing container ID event:', target, event);
    
    // Check for infinite loop condition with repeated "root-" prefixes
    if (target.includes('root-root-root')) {
      console.warn('$syncEvent: Detected infinite loop pattern, using root container instead');
      const rootCollabNode = binding.root;
      if (rootCollabNode) {
        processCollabNodeEvent(binding, rootCollabNode, event);
        return;
      }
    }
    
    // For root-related events, always use the existing root collaboration node
    if (target.includes('root') && target.includes('_attrs:Map')) {
      const rootCollabNode = binding.root;
      if (rootCollabNode) {
        console.log('$syncEvent: Using root collab node for root attributes event');
        processCollabNodeEvent(binding, rootCollabNode, event);
        return;
      }
    }
    
    // Try to find the corresponding collaboration node by searching existing nodes
    let foundCollabNode;
    
    // Search through all existing collaboration nodes to find one with matching container
    for (const [sharedType, collabNode] of binding.collabNodeMap.entries()) {
      // Check if this collaboration node's shared type matches the target container ID
      const sharedTypeStr = sharedType.toString();
      if (sharedTypeStr.includes(target) || (target.includes('root') && collabNode._key === 'root')) {
        foundCollabNode = collabNode;
        console.log('$syncEvent: Found existing collab node for', target, ':', collabNode);
        break;
      }
    }
    
    if (foundCollabNode) {
      // Process the event with the found collaboration node
      processCollabNodeEvent(binding, foundCollabNode, event);
      return;
    }
    
    // Skip creating new containers for repeated/invalid IDs to prevent infinite loops
    console.warn('$syncEvent: Skipping container creation for potentially problematic ID:', target);
    return;
  }
  
  const collabNode = $getOrInitCollabNodeFromSharedType(binding, target);

  // Skip processing if collabNode is null (raw Loro container without __type)
  if (!collabNode) {
    console.warn('$syncEvent: Skipping event for raw Loro container:', target?.constructor?.name, 'Event:', event);
    return;
  }
  
  processCollabNodeEvent(binding, collabNode, event);
}

function processCollabNodeEvent(binding: Binding, collabNode: any, event: any): void {
  // Debug logging to understand event structure
  console.log('processCollabNodeEvent: collabNode type:', collabNode.constructor.name);
  console.log('processCollabNodeEvent: event structure:', {
    isTextEvent: (event as any).isTextEvent,
    isMapEvent: (event as any).isMapEvent,
    isXmlEvent: (event as any).isXmlEvent,
    keysChanged: event.keysChanged,
    childListChanged: event.childListChanged,
    attributesChanged: event.attributesChanged,
    delta: event.delta,
    eventKeys: Object.keys(event)
  });

  if (collabNode instanceof CollabElementNode && (event as any).isTextEvent) {
    const {keysChanged, childListChanged, delta} = event as any;

    // Update
    if (keysChanged && keysChanged.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, keysChanged);
    }

    if (childListChanged) {
      collabNode.applyChildrenCRDTDelta(binding, delta);
      collabNode.syncChildrenFromCRDT(binding);
    }
  } else if (
    collabNode instanceof CollabTextNode &&
    (event as any).isMapEvent
  ) {
    const {keysChanged} = event;

    // Update
    if (keysChanged && keysChanged.size > 0) {
      collabNode.syncPropertiesAndTextFromCRDT(binding, keysChanged);
    }
  } else if (
    collabNode instanceof CollabDecoratorNode &&
    ((event as any).isMapEvent || (event as any).isXmlEvent)
  ) {
    const {attributesChanged, keysChanged} = event;
    const changedKeys = attributesChanged || keysChanged;

    // Update
    if (changedKeys && changedKeys.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, changedKeys);
    }
  } else {
    // More graceful handling - log and skip instead of throwing error
    console.warn('processCollabNodeEvent: Unhandled event type for collab node:', {
      collabNodeType: collabNode.constructor.name,
      eventType: event.constructor?.name,
      isTextEvent: (event as any).isTextEvent,
      isMapEvent: (event as any).isMapEvent,
      isXmlEvent: (event as any).isXmlEvent,
      eventKeys: Object.keys(event)
    });
    
    // Try to handle based on what properties the event has
    if (event.keysChanged || event.attributesChanged) {
      const changedKeys = event.keysChanged || event.attributesChanged;
      if (changedKeys && changedKeys.size > 0) {
        if (collabNode.syncPropertiesFromCRDT) {
          collabNode.syncPropertiesFromCRDT(binding, changedKeys);
        } else if (collabNode.syncPropertiesAndTextFromCRDT) {
          collabNode.syncPropertiesAndTextFromCRDT(binding, changedKeys);
        }
      }
    }
    
    if (event.childListChanged && event.delta) {
      if (collabNode.applyChildrenCRDTDelta && collabNode.syncChildrenFromCRDT) {
        collabNode.applyChildrenCRDTDelta(binding, event.delta);
        collabNode.syncChildrenFromCRDT(binding);
      }
    }
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

  // This line precompute the delta before editor update. The reason is
  // delta is computed when it is accessed. Note that this can only be
  // safely computed during the event call. If it is accessed after event
  // call it might result in unexpected behavior.
  // For Loro, we need to ensure deltas are computed during event processing
  events.forEach((event) => {
    if ((event as any).delta) {
      // Access delta to trigger computation if needed
      (event as any).delta;
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
