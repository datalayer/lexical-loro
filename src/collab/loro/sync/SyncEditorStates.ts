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
  AnyCollabNode,
  syncCursorPositions,
  SyncCursorPositionsFn,
  syncLexicalSelectionToCRDT,
} from './SyncCursors';
import {
  $getOrInitCollabNodeFromSharedType,
  $moveSelectionToPreviousNode,
  doesSelectionNeedRecovering,
  syncWithTransaction,
} from '../Utils';

// For Loro, state events are events that target attribute containers (_attrs:Map)
// This handles node state synchronization for properties stored in nested containers
function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const target = event.target;
  
  // Check if this is a state-related event (targets ending with "_attrs:Map")
  if (typeof target === 'string' && target.includes('_attrs:Map')) {
    console.log('$syncStateEvent: Processing state event:', target, event);
    
    // Extract the base container ID: cid:root-element_1_attrs:Map -> element_1
    const match = target.match(/^cid:root-(.+)_attrs:Map$/);
    if (!match) {
      return false;
    }
    
    const baseContainerId = match[1];
    
    // Find existing collaboration node by looking through the collabNodeMap
    // This is different from Y.js because we need to find the node by container ID pattern
    for (const [nodeKey, collabNode] of binding.collabNodeMap.entries()) {
      let isMatch = false;
      
      if (baseContainerId === 'root' && collabNode._key === 'root') {
        isMatch = true;
      } else if (collabNode._key && baseContainerId.includes(collabNode._key)) {
        isMatch = true;
      }
      
      if (isMatch) {
        console.log('$syncStateEvent: Found existing collab node for state update:', baseContainerId, collabNode);
        const node = collabNode.getNode();
        if (node && (event as any).diff) {
          const state = $getWritableNodeState(node.getWritable());
          // Update state properties from the diff
          const diff = (event as any).diff;
          for (const key in diff) {
            state.updateFromUnknown(key, diff[key]);
          }
          console.log('$syncStateEvent: Updated node state for', baseContainerId, diff);
          return true;
        }
      }
    }
    
    console.warn('$syncStateEvent: Could not find existing collaboration node for state event:', target);
    return false;
  }
  
  return false;
}

function $syncEvent(binding: Binding, event: LoroEvent): void {
  // First check if this is a state event that should be handled specially
  if ($syncStateEvent(binding, event)) {
    return;
  }
  
  const target = event.target;
  
  // Handle container ID strings - find existing collaboration nodes directly (Loro-native approach)
  if (typeof target === 'string') {
    console.log('$syncEvent: Processing container ID event:', target, event);
    
    // Extract the container ID pattern: cid:root-containerId:Type
    const match = target.match(/^cid:root-(.+):(\w+)$/);
    if (!match) {
      console.warn('$syncEvent: Invalid container ID format:', target);
      return;
    }
    
    const [, containerId, containerType] = match;
    
    // Find existing collaboration node by container ID pattern (avoid creating new objects)
    let foundCollabNode = null;
    
    for (const [nodeKey, collabNode] of binding.collabNodeMap.entries()) {
      // Match collaboration nodes by their container patterns
      let isMatch = false;
      
      if (containerId === 'root' && collabNode._key === 'root') {
        isMatch = true;
      } else if (containerId.startsWith('element_') && collabNode._key) {
        const elementKey = containerId.replace('element_', '');
        if (collabNode._key === elementKey) {
          isMatch = true;
        }
      } else if (containerId.startsWith('text_') && collabNode._key) {
        const textKey = containerId.replace('text_', '');
        if (collabNode._key === textKey) {
          isMatch = true;
        }
      } else if (containerId.startsWith('linebreak_') && collabNode._key) {
        const linebreakKey = containerId.replace('linebreak_', '');
        if (collabNode._key === linebreakKey) {
          isMatch = true;
        }
      } else if (containerId.startsWith('decorator_') && collabNode._key) {
        const decoratorKey = containerId.replace('decorator_', '');
        if (collabNode._key === decoratorKey) {
          isMatch = true;
        }
      }
      
      if (isMatch) {
        foundCollabNode = collabNode;
        break;
      }
    }
    
    if (foundCollabNode) {
      console.log('$syncEvent: Found existing collab node for', target, ':', foundCollabNode);
      processCollabNodeEvent(binding, foundCollabNode, event);
    } else {
      console.warn('$syncEvent: Could not find existing collaboration node for container:', containerId, containerType);
      console.warn('Available collaboration nodes:');
      for (const [nodeKey, collabNode] of binding.collabNodeMap.entries()) {
        console.warn('  -', collabNode.constructor.name, 'key:', collabNode._key, 'nodeKey:', nodeKey);
      }
    }
    
    return;
  }
  
  // If target is not a string, it should be a shared type object (like Y.js)
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
  // Follow Y.js pattern: handle different event types for different node types
  const eventData = event as any;
  
  if (collabNode instanceof CollabElementNode) {
    // Similar to Y.js YTextEvent handling for element nodes
    const diff = eventData.diff;
    
    // Handle property changes (similar to keysChanged in Y.js)
    if (diff && typeof diff === 'object') {
      const changedKeys = new Set(Object.keys(diff));
      if (changedKeys.size > 0) {
        collabNode.syncPropertiesFromCRDT(binding, changedKeys);
      }
    }
    
    // Handle structural changes (similar to childListChanged in Y.js)
    // For now, always sync children when there's a diff to be safe
    if (diff) {
      collabNode.syncChildrenFromCRDT(binding);
    }
    
  } else if (collabNode instanceof CollabTextNode) {
    // Similar to Y.js YMapEvent handling for text nodes
    const diff = eventData.diff;
    
    if (diff && typeof diff === 'object') {
      const changedKeys = new Set(Object.keys(diff));
      if (changedKeys.size > 0) {
        collabNode.syncPropertiesAndTextFromCRDT(binding, changedKeys);
      }
    }
    
  } else if (collabNode instanceof CollabDecoratorNode) {
    // Similar to Y.js YXmlEvent handling for decorator nodes
    const diff = eventData.diff;
    
    if (diff && typeof diff === 'object') {
      const changedAttributes = new Set(Object.keys(diff));
      if (changedAttributes.size > 0) {
        collabNode.syncPropertiesFromCRDT(binding, changedAttributes);
      }
    }
    
  } else {
    console.warn('processCollabNodeEvent: Unexpected collaboration node type:', collabNode.constructor.name);
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
