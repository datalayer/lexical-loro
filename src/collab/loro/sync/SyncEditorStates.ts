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
import { LoroEvent, LoroEventBatch } from 'loro-crdt';
import invariant from '../../utils/invariant';
import {
  $getOrInitCollabNodeFromSharedType,
  $moveSelectionToPreviousNode,
  doesSelectionNeedRecovering,
  syncWithTransaction,
} from '../utils/Utils';
import { Binding } from '../Bindings';
import {Provider} from '../State';
import {CollabDecoratorNode} from '../nodes/CollabDecoratorNode';
import {CollabElementNode} from '../nodes/CollabElementNode';
import {CollabTextNode} from '../nodes/CollabTextNode';
import { AnyCollabNode } from '../nodes/AnyCollabNode';
import {
  $syncLocalCursorPosition,
  syncCursorPositions,
  SyncCursorPositionsFn,
  syncLexicalSelectionToCRDT,
} from './SyncCursors';

/*****************************************************************************/

type IntentionallyMarkedAsDirtyElement = boolean;

/******************************************************************************
 * CRDT -> Lexical
 *****************************************************************************/
/*
function $syncStateEvent(binding: Binding, event: LoroEvent): boolean {
  const {target} = event;
  if (
    !(
      target._item &&
      target._item.parentSub === '__state' &&
      getNodeTypeFromSharedType(target) === undefined &&
      (target.parent instanceof XmlText ||
        target.parent instanceof XmlElement ||
        target.parent instanceof YMap)
    )
  ) {
    // TODO there might be a case to handle in here when a YMap
    // is used as a value  of __state? It would probably be desirable
    // to mark the node as dirty when that happens.
    return false;
  }
  const collabNode = $getOrInitCollabNodeFromSharedType(binding, target.parent);
  const node = collabNode.getNode();
  if (node) {
    const state = $getWritableNodeState(node.getWritable());
    for (const k of event.keysChanged) {
      state.updateFromUnknown(k, target.get(k));
    }
  }
  return true;
}
*/
function $syncEvent(binding: Binding, event: LoroEvent): void {
  /*
  if (event.target.endsWith(':Map') && $syncStateEvent(binding, event)) {
    return;
  }
  */
  const {diff, path, target} = event;


  const collabNode = $getOrInitCollabNodeFromSharedType(binding, target);

  console.log('---DLA $syncEvent', event);
  console.log('---DLA $syncEvent', collabNode);
  console.log('---DLA $syncEvent', diff);

  /*
  if (collabNode instanceof CollabElementNode && diff.type === 'map') {
    // Update
    if (keysChanged.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, keysChanged);
    }

    if (childListChanged) {
      collabNode.applyChildrenCRDTDelta(binding, delta);
      collabNode.syncChildrenFromCRDT(binding);
    }
  } else if (
    collabNode instanceof CollabTextNode &&
    diff.type === 'map'
  ) {
    const {keysChanged} = event;

    // Update
    if (keysChanged.size > 0) {
      collabNode.syncPropertiesAndTextFromCRDT(binding, keysChanged);
    }
  } else if (
    collabNode instanceof CollabDecoratorNode &&
    diff.type === 'map'
  ) {
    const {attributesChanged} = event;

    // Update
    if (attributesChanged.size > 0) {
      collabNode.syncPropertiesFromCRDT(binding, attributesChanged);
    }
  } else {
    invariant(false, 'Expected text, element, or decorator event');
  }
  */
}

export function syncCRDTUpdatesToLexical(
  binding: Binding,
  provider: Provider,
  eventBatch: LoroEventBatch,
  isFromUndoManger: boolean,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): void {
  const events = eventBatch.events;
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
      const collabRoot = binding.root;

      const isInitialSyncNeeded = collabRoot.isEmpty() && 
                                  collabRoot.getSharedType()?.length === 0 && 
                                  lexicalRoot.getChildren().length > 0;

      if ((tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) && !isInitialSyncNeeded) {
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }
        return;
      }

      if (dirtyElements.has('root')) {
        const prevNodeMap = prevEditorState._nodeMap;
        const nextLexicalRoot = $getRoot();
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
