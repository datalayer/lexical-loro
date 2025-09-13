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
// This mimics Y.js $syncStateEvent which checks target._item.parentSub === '__state'
function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const target = event.target;
  
  // Check if this is a state-related event (similar to Y.js parentSub === '__state')
  if (typeof target === 'string' && target.includes('_attrs:Map')) {
    console.debug('$syncStateEvent: Processing state event:', target, event);
    
    // Extract parent container ID (similar to Y.js target.parent)
    const match = target.match(/^cid:root-(.+)_attrs:Map$/);
    if (!match) {
      return false;
    }
    
    const baseContainerId = match[1];
    
    // Get the parent shared type (similar to Y.js target.parent)
    const parentSharedType = getParentSharedTypeFromStateTarget(binding, baseContainerId);
    if (!parentSharedType) {
      return false;
    }
    
    // Get collab node from parent (same as Y.js: $getOrInitCollabNodeFromSharedType(binding, target.parent))
    const collabNode = $getOrInitCollabNodeFromSharedType(binding, parentSharedType as any, binding.root);
    const node = collabNode.getNode();
    if (node) {
      const state = $getWritableNodeState(node.getWritable());
      // Update state properties from changed keys (similar to Y.js event.keysChanged)
      const keysChanged = getChangedKeys(event);
      for (const k of keysChanged) {
        // In Y.js: state.updateFromUnknown(k, target.get(k))
        // For Loro: get value from the event diff
        const value = getValueFromEventDiff(event, k);
        if (value !== undefined) {
          state.updateFromUnknown(k, value);
        }
      }
      return true;
    }
  }
  
  return false;
}

// Helper to get parent shared type from state target
function getParentSharedTypeFromStateTarget(binding: Binding, baseContainerId: string): any {
  // Find the parent container that this state belongs to
  if (baseContainerId === 'root') {
    return binding.root; // Return root binding directly
  }
  
  // For element/text containers, get the corresponding shared type
  if (baseContainerId.startsWith('element_')) {
    const elementId = baseContainerId.replace('element_', '');
    return binding.doc.getMap(elementId); // Element nodes are typically backed by maps
  } else if (baseContainerId.startsWith('text_')) {
    const textId = baseContainerId.replace('text_', '');
    const loroText = binding.doc.getText(textId);
    if (loroText) {
      let xmlText = (loroText as any)._xmlText;
      if (!xmlText) {
        xmlText = new XmlText(binding.doc, textId);
        (loroText as any)._xmlText = xmlText;
      }
      return xmlText;
    }
  }
  
  return null;
}

// Helper to get value from Loro event diff for a specific key
function getValueFromEventDiff(event: LoroEvent, key: string): any {
  if (event.diff?.type === 'map' && (event.diff as any).updated) {
    return (event.diff as any).updated[key];
  }
  return undefined;
}

function $syncEvent(binding: Binding, event: LoroEvent): void {
  console.info('[$syncEvent] Processing event:', {
    target: event.target,
    diff: event.diff
  });
  
  // First check if this is a state event that should be handled specially
  // In Y.js: if (event instanceof YMapEvent && $syncStateEvent(binding, event))
  if (event.diff?.type === 'map' && $syncStateEvent(binding, event)) {
    return;
  }
  
  // Get the shared type object from the target (similar to Y.js: const {target} = event)
  const sharedType = getSharedTypeFromTarget(binding, event.target);
  if (!sharedType) {
    console.warn('[$syncEvent] Could not resolve shared type for target:', event.target);
    return;
  }
  
  // Get or create collab node from shared type (same as Y.js)
  const collabNode = $getOrInitCollabNodeFromSharedType(binding, sharedType as any, binding.root);
  
  // Process event based on collab node and event type (matching Y.js patterns)
  if (collabNode instanceof CollabElementNode && event.diff?.type === 'text') {
    // Similar to Y.js: CollabElementNode && event instanceof YTextEvent
    const keysChanged = getChangedKeys(event);
    const delta = event.diff.diff;

    // Update properties
    if (keysChanged.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, keysChanged);
    }

    // Update children if there's a text delta
    if (delta && Array.isArray(delta)) {
      collabNode.applyChildrenCRDTDelta(binding, delta);
      collabNode.syncChildrenFromCRDT(binding);
    }
  } else if (
    collabNode instanceof CollabTextNode &&
    event.diff?.type === 'map'
  ) {
    // Similar to Y.js: CollabTextNode && event instanceof YMapEvent
    const keysChanged = getChangedKeys(event);

    // Update properties and text
    if (keysChanged.size > 0) {
      collabNode.syncPropertiesAndTextFromCRDT(binding, keysChanged);
    }
  } else if (
    collabNode instanceof CollabDecoratorNode &&
    event.diff?.type === 'map'
  ) {
    // Similar to Y.js: CollabDecoratorNode && event instanceof YXmlEvent
    const attributesChanged = getChangedKeys(event);

    // Update properties
    if (attributesChanged.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, attributesChanged);
    }
  } else {
    invariant(false, 'Expected text, element, or decorator event');
  }
}

// Helper function to get shared type from target (mimics Y.js event.target)
function getSharedTypeFromTarget(binding: Binding, target: string | ContainerID): any {
  try {
    if (typeof target === 'string') {
      if (target.includes(':Text')) {
        // Get LoroText and wrap in XmlText
        const textId = target.replace(/^cid:/, '').replace(/:Text$/, '');
        const loroText = binding.doc.getText(textId);
        if (loroText) {
          // Create or reuse XmlText wrapper
          let xmlText = (loroText as any)._xmlText;
          if (!xmlText) {
            xmlText = new XmlText(binding.doc, textId);
            (loroText as any)._xmlText = xmlText;
          }
          return xmlText;
        }
      } else if (target.includes(':Map')) {
        // Get LoroMap directly
        const mapId = target.replace(/^cid:/, '').replace(/:Map$/, '');
        return binding.doc.getMap(mapId);
      }
    }
  } catch (error) {
    console.warn('[getSharedTypeFromTarget] Error resolving shared type:', error);
  }
  return null;
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
