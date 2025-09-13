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
  ContainerID,
  ContainerType,
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

interface ParsedContainerID {
  containerId: string;
  containerType: ContainerType;
  isRoot: boolean;
}

// Utility functions for simplified event processing
function parseContainerID(target: ContainerID): ParsedContainerID | null {
  const rootMatch = target.match(/^cid:root-(.+):(\w+)$/);
  if (rootMatch) {
    return {
      containerId: rootMatch[1],
      containerType: rootMatch[2] as ContainerType,
      isRoot: true
    };
  }
  
  const peerMatch = target.match(/^cid:(\d+)@(.+):(\w+)$/);
  if (peerMatch) {
    return {
      containerId: `${peerMatch[1]}@${peerMatch[2]}`,
      containerType: peerMatch[3] as ContainerType,
      isRoot: false
    };
  }
  
  return null;
}

function findCollabNodeByContainerID(binding: Binding, parsedID: ParsedContainerID): AnyCollabNode | null {
  const { containerId, isRoot } = parsedID;
  
  // Handle root container
  if (isRoot && containerId === 'root') {
    return binding.root;
  }
  
  // Find collaboration node by matching container patterns
  for (const [nodeKey, collabNode] of binding.collabNodeMap.entries()) {
    if (isRoot) {
      // Root-based containers: element_1, text_2, etc.
      if (containerId.startsWith('element_') && collabNode._key === containerId.replace('element_', '')) {
        return collabNode;
      }
      if (containerId.startsWith('text_') && collabNode._key === containerId.replace('text_', '')) {
        return collabNode;
      }
      if (containerId.startsWith('linebreak_') && collabNode._key === containerId.replace('linebreak_', '')) {
        return collabNode;
      }
      if (containerId.startsWith('decorator_') && collabNode._key === containerId.replace('decorator_', '')) {
        return collabNode;
      }
    } else {
      // Peer-based containers - direct match
      if (collabNode._key === containerId) {
        return collabNode;
      }
    }
  }
  
  return null;
}

function extractTextFromLoroEvent(event: LoroEvent): string {
  if (event.diff?.type === 'text' && Array.isArray(event.diff.diff)) {
    return event.diff.diff
      .filter(op => op?.insert && typeof op.insert === 'string')
      .map(op => op.insert)
      .join('');
  }
  return '';
}

function hasPropertyChanges(event: LoroEvent): boolean {
  return event.diff?.type === 'map' && (event.diff as any).updated && Object.keys((event.diff as any).updated).length > 0;
}

function getChangedKeys(event: LoroEvent): Set<string> {
  if (event.diff?.type === 'map' && (event.diff as any).updated) {
    return new Set(Object.keys((event.diff as any).updated));
  }
  return new Set();
}

// For Loro, state events are events that target attribute containers (_attrs:Map)
// This handles node state synchronization for properties stored in nested containers
function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const target = event.target;
  
  // Check if this is a state-related event (targets ending with "_attrs:Map")
  if (typeof target === 'string' && target.includes('_attrs:Map')) {
    console.debug('$syncStateEvent: Processing state event:', target, event);
    
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
        console.debug('$syncStateEvent: Found existing collab node for state update:', baseContainerId, collabNode);
        const node = collabNode.getNode();
        if (node && (event as any).diff) {
          const state = $getWritableNodeState(node.getWritable());
          // Update state properties from the diff
          const diff = (event as any).diff;
          for (const key in diff) {
            state.updateFromUnknown(key, diff[key]);
          }
          console.debug('$syncStateEvent: Updated node state for', baseContainerId, diff);
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
  console.info('[$syncEvent] Processing event:', {
    target: event.target,
    diff: event.diff
  });
  
  // First check if this is a state event that should be handled specially
  if ($syncStateEvent(binding, event)) {
    return;
  }
  
  const target = event.target;
  
  // Try to get or create collaboration node directly from the shared type
  // This is more similar to the Y.js approach: $getOrInitCollabNodeFromSharedType(binding, target)
  let collabNode: AnyCollabNode | null = null;
  
  // For Loro, we need to get the actual shared type object, not just parse the container ID
  try {
    if (target.includes(':Text')) {
      // This is a text container - get the XmlText shared type
      const textId = target.replace(/^cid:/, '').replace(/:Text$/, '');
      const sharedType = binding.doc.getText(textId);
      if (sharedType) {
        collabNode = $getOrInitCollabNodeFromSharedType(binding, sharedType as any, binding.root);
      }
    } else if (target.includes(':Map')) {
      // This is a map container - get the LoroMap shared type  
      const mapId = target.replace(/^cid:/, '').replace(/:Map$/, '');
      const sharedType = binding.doc.getMap(mapId);
      if (sharedType) {
        collabNode = $getOrInitCollabNodeFromSharedType(binding, sharedType as any, binding.root);
      }
    }
  } catch (error) {
    console.warn('[$syncEvent] Could not get shared type for target:', target, error);
  }
  
  // If we found a collaboration node, process the event using Y.js-like pattern
  if (collabNode) {
    console.info('[$syncEvent] Found collab node, processing event...');
    processCollabNodeEventSimple(binding, collabNode, event);
  } else {
    // Fallback to the old complex parsing method
    console.info('[$syncEvent] No collab node found, using fallback method...');
    const parsedID = parseContainerID(target as ContainerID);
    if (parsedID) {
      collabNode = findCollabNodeByContainerID(binding, parsedID);
      if (collabNode) {
        processCollabNodeEventSimple(binding, collabNode, event);
      } else {
        handleMissingCollabNode(binding, parsedID, event);
      }
    }
  }
}

function findTargetElementForText(binding: Binding, parsedID: ParsedContainerID): CollabElementNode | null {
  const { containerId } = parsedID;
  
  // For root text events, find first paragraph
  if (containerId === 'root') {
    for (const [, node] of binding.collabNodeMap.entries()) {
      if (node._type === 'paragraph' || node._type === 'heading') {
        return node as CollabElementNode;
      }
    }
  }
  
  // For element-specific text events
  if (containerId.startsWith('element_')) {
    const elementKey = containerId.replace('element_', '');
    for (const [, node] of binding.collabNodeMap.entries()) {
      if (node._key === elementKey && (node._type === 'paragraph' || node._type === 'heading')) {
        return node as CollabElementNode;
      }
    }
  }
  
  return null;
}

function handleMissingCollabNode(binding: Binding, parsedID: ParsedContainerID, event: LoroEvent): void {
  const { containerId, containerType } = parsedID;
  
  // For text containers, we should avoid aggressive text replacement
  if (containerType === 'Map' && containerId.startsWith('text_')) {
    // Try to find if there's a corresponding text delta we can apply
    if (event.diff?.type === 'text' && event.diff.diff && Array.isArray(event.diff.diff)) {
      const targetElement = findTargetElementForText(binding, parsedID);
      if (targetElement) {
        targetElement.applyChildrenCRDTDelta(binding, event.diff.diff);
      }
    }
    return;
  }
  
  // For other missing nodes, we could implement on-demand creation here
  // but for now, just log a warning
  console.warn('$syncEvent: Missing collaboration node for:', containerId, containerType);
}

// Simplified event processing that matches Y.js pattern more closely
function processCollabNodeEventSimple(binding: Binding, collabNode: AnyCollabNode, event: LoroEvent): void {
  console.debug('[processCollabNodeEventSimple] Processing event for collab node:', collabNode._key, event);
  
  if (collabNode instanceof CollabElementNode) {
    // Handle property changes first (similar to Y.js keysChanged)
    if (hasPropertyChanges(event)) {
      const changedKeys = getChangedKeys(event);
      if (changedKeys.size > 0) {
        console.debug('[processCollabNodeEventSimple] Syncing properties:', changedKeys);
        collabNode.syncPropertiesFromCRDT(binding, changedKeys);
      }
    }
    
    // Handle child list changes (similar to Y.js childListChanged with delta)
    if (event.diff?.type === 'text' && event.diff.diff && Array.isArray(event.diff.diff)) {
      console.info('[processCollabNodeEventSimple] Applying children delta:', event.diff.diff);
      collabNode.applyChildrenCRDTDelta(binding, event.diff.diff);
      collabNode.syncChildrenFromCRDT(binding);
    }
    
  } else if (collabNode instanceof CollabTextNode) {
    // Handle text node changes
    if (hasPropertyChanges(event)) {
      const changedKeys = getChangedKeys(event);
      if (changedKeys.size > 0) {
        console.debug('[processCollabNodeEventSimple] Syncing text properties:', changedKeys);
        collabNode.syncPropertiesAndTextFromCRDT(binding, changedKeys);
      }
    }
    
  } else if (collabNode instanceof CollabDecoratorNode) {
    // Handle decorator node changes
    if (hasPropertyChanges(event)) {
      const changedKeys = getChangedKeys(event);
      if (changedKeys.size > 0) {
        console.debug('[processCollabNodeEventSimple] Syncing decorator properties:', changedKeys);
        collabNode.syncPropertiesFromCRDT(binding, changedKeys);
      }
    }
    
  } else {
    console.warn('[processCollabNodeEventSimple] Unknown collaboration node type:', collabNode);
  }
}

export function syncCRDTChangesToLexical(
  binding: Binding,
  provider: Provider,
  events: Array<LoroEvent>,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {
  console.info('[syncCRDTChangesToLexical] Processing', events.length, 'events');
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  // Loro events already have computed diffs, no pre-processing needed
  // (Unlike Y.js which requires delta pre-computation)

  editor.update(
    () => {
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.debug('[syncCRDTChangesToLexical] Processing event', i, ':', event);
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
      // Skip if this update originated from collaboration to prevent loops
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }
        return;
      }

      // Sync root changes if root is dirty
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

      // Sync selection changes
      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      syncLexicalSelectionToCRDT(binding, provider, prevSelection, selection);
    });
  });
}
