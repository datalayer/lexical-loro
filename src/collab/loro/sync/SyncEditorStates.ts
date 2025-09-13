import type {EditorState, NodeKey} from 'lexical';

import {
  $addUpdateTag,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getWritableNodeState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  SKIP_COLLAB_TAG,
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
import { AnyCollabNode } from '../../yjs/sync/SyncCursors';
import { CollabLineBreakNode } from '../nodes/CollabLineBreakNode';

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

function $syncEvent(binding: Binding, event: LoroEvent): void {
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
    
    // Try to find the corresponding collaboration node using prioritized matching
    console.log('$syncEvent: Searching for collab node matching target:', target);
    
    // Get all available collab nodes for debugging
    const allCollabNodes = Array.from(binding.collabNodeMap.values());
    console.log('$syncEvent: Available collab nodes:', allCollabNodes.map(node => ({
      key: node._key,
      type: node._type,
      constructor: node.constructor.name
    })));
    
    let foundCollabNode = null;
    
    // Prioritized matching: element-specific → root-specific → generic fallback
    
    // First: Look for element-specific matches (element_X pattern)
    for (const collabNode of allCollabNodes) {
      if (target.includes(`element_${collabNode._key}:`)) {
        foundCollabNode = collabNode;
        console.log(`$syncEvent: Found ELEMENT match for ${target} :`, collabNode);
        break;
      }
    }
    
    // Second: Look for root-specific matches if no element match found
    if (!foundCollabNode) {
      for (const collabNode of allCollabNodes) {
        if (target.includes('root-root:') && collabNode._key === 'root') {
          foundCollabNode = collabNode;
          console.log(`$syncEvent: Found ROOT match for ${target} :`, collabNode);
          break;
        }
      }
    }
    
    // Third: Generic fallback matching
    if (!foundCollabNode) {
      for (const collabNode of allCollabNodes) {
        if (target.includes(collabNode._key) && !target.includes('root-root:')) {
          foundCollabNode = collabNode;
          console.log(`$syncEvent: Found GENERIC match for ${target} :`, collabNode);
          break;
        }
      }
    }
    
    if (foundCollabNode) {
      // Process the event with the found collaboration node
      processCollabNodeEvent(binding, foundCollabNode, event);
      return;
    }
    
      // Y.js-aligned approach: Try to create missing CollabElementNode for element_X pattern
      const elementMatch = target.match(/element_(\d+)/);
      if (elementMatch) {
        const elementKey = elementMatch[1];
        console.log(`$syncEvent: Creating missing CollabElementNode for key: ${elementKey}`);
        
        try {
          // Get the root CollabElementNode
          const rootCollabNode = binding.collabNodeMap.get('root');
          if (rootCollabNode instanceof CollabElementNode) {
            // Check if there's a corresponding Lexical node
            let lexicalNode = $getNodeByKey(elementKey);
            
            if (!lexicalNode || !$isElementNode(lexicalNode)) {
              // Lexical node doesn't exist yet - create it first
              console.log(`$syncEvent: Creating missing Lexical paragraph for key: ${elementKey}`);
              
              const rootLexicalNode = rootCollabNode.getNode();
              if (rootLexicalNode) {
                const writableRoot = rootLexicalNode.getWritable();
                const newParagraph = $createParagraphNode();
                writableRoot.append(newParagraph);
                // After appending, set the key to match the CRDT element key
                newParagraph.__key = elementKey;
                lexicalNode = newParagraph;
                
                console.log(`✅ $syncEvent: Created Lexical paragraph with key: ${elementKey}`);
              }
            }
            
            if (lexicalNode && $isElementNode(lexicalNode)) {
              const elementType = lexicalNode.getType();
              const doc = rootCollabNode._xmlText.getDoc();
              
              // Create XmlText for this element - use the target container ID
              const childXmlTextId = `element_${elementKey}`;
              const childXmlText = new XmlText(doc, childXmlTextId);
              
              // Create the CollabElementNode
              const collabElementNode = new CollabElementNode(
                childXmlText,
                rootCollabNode, // parent
                elementType
              );
              
              // Set the key
              collabElementNode._key = elementKey;
              
              // Add to parent's children and register in the binding
              rootCollabNode._children.push(collabElementNode);
              binding.collabNodeMap.set(elementKey, collabElementNode);
              
              console.log(`✅ $syncEvent: Created CollabElementNode for key ${elementKey}, type: ${elementType}`);
              
              // Now process the event with the newly created node
              processCollabNodeEvent(binding, collabElementNode, event);
              return;
            }
          }
        } catch (error) {
          console.error(`❌ $syncEvent: Error creating CollabElementNode for key ${elementKey}:`, error);
        }
      }    // Skip creating new containers for repeated/invalid IDs to prevent infinite loops
    console.warn('$syncEvent: Skipping container creation for potentially problematic ID:', target);
    return;
  }
  
  const collabNode = $getOrInitCollabNodeFromSharedType(binding, target);

  // Skip processing if collabNode is null (raw Loro container without __type)
  if (!collabNode) {
    console.warn('$syncEvent: Skipping event for raw Loro container:', (target as any).constructor?.name, 'Event:', event);
    return;
  }
  
  processCollabNodeEvent(binding, collabNode, event);
}

function processCollabNodeEvent(binding: Binding, collabNode: | CollabElementNode | CollabTextNode | CollabLineBreakNode | CollabDecoratorNode, event: LoroEvent): void {
  console.log('🔧 [ProcessCollabNodeEvent] ENTRY:', {
    collabNodeType: collabNode.constructor.name,
    collabNodeKey: collabNode._key,
    isCollabElementNode: collabNode instanceof CollabElementNode,
    eventHasDiff: !!event.diff,
    eventHasPath: !!event.path,
    eventHasTarget: !!event.target,
    eventDiffType: event.diff?.type
  });

  // Handle Loro-style events based on actual LoroEvent structure
  if (collabNode instanceof CollabElementNode && event.diff) {
    console.log('📝 [ProcessCollabNodeEvent] Processing CollabElementNode with diff:', {
      diffType: event.diff.type,
      hasDiff: !!event.diff,
      diffString: JSON.stringify(event.diff)
    });

    // Handle different diff types appropriately (align with Y.js approach)
    try {
      console.log('📝 [ProcessCollabNodeEvent] Syncing CRDT state to Lexical (no delta application)');
      // Just sync the current CRDT state to Lexical without applying new deltas
      // This prevents infinite loops while ensuring the Lexical editor reflects CRDT state
      collabNode.syncChildrenFromCRDT(binding);
    } catch (error) {
      console.warn('Failed to sync children from CRDT:', error);
    }
  } else if (collabNode instanceof CollabTextNode && event.diff) {
    console.log('📄 [ProcessCollabNodeEvent] Processing CollabTextNode with diff');
    
    // For CollabTextNode, sync properties and text from CRDT
    try {
      console.log('🔧 [ProcessCollabNodeEvent] Syncing CollabTextNode properties and text from CRDT');
      collabNode.syncPropertiesAndTextFromCRDT(binding, null);
    } catch (error) {
      console.warn('Failed to sync CollabTextNode:', error);
    }
  } else if (collabNode instanceof CollabDecoratorNode && event.diff) {
    console.log('🎨 [ProcessCollabNodeEvent] Processing CollabDecoratorNode with diff');
    
    // For CollabDecoratorNode, sync properties from CRDT
    try {
      console.log('🔧 [ProcessCollabNodeEvent] Syncing CollabDecoratorNode properties from CRDT');
      collabNode.syncPropertiesFromCRDT(binding, null);
    } catch (error) {
      console.warn('Failed to sync CollabDecoratorNode:', error);
    }
  } else {
    // Handle other Loro event types
    console.log('🔧 [ProcessCollabNodeEvent] Handling other Loro event type');
    
    if (event.diff) {
      console.log('📝 [ProcessCollabNodeEvent] Event has diff, attempting generic sync');
      
      // Generic fallback: try to sync from CRDT based on node type
      try {
        if (collabNode instanceof CollabElementNode) {
          console.log('� [ProcessCollabNodeEvent] Syncing CollabElementNode children from CRDT');
          collabNode.syncChildrenFromCRDT(binding);
        } else if (collabNode instanceof CollabTextNode) {
          console.log('🔄 [ProcessCollabNodeEvent] Syncing CollabTextNode from CRDT');
          collabNode.syncPropertiesAndTextFromCRDT(binding, null);
        } else {
          console.log('🔄 [ProcessCollabNodeEvent] Syncing generic CollabNode properties from CRDT');
          (collabNode as any).syncPropertiesFromCRDT?.(binding, null);
        }
      } catch (error) {
        console.warn('Failed to sync from CRDT:', error);
      }
    } else {
      // Log unhandled event for debugging
      console.warn('⚠️ [ProcessCollabNodeEvent] UNHANDLED EVENT TYPE:', {
        collabNodeType: collabNode.constructor.name,
        collabNodeKey: collabNode._key,
        eventKeys: Object.keys(event),
        eventConstructor: event.constructor?.name,
        hasDiff: !!event.diff,
        hasPath: !!event.path,
        hasTarget: !!event.target
      });
      console.log('📋 [ProcessCollabNodeEvent] Full event object:', event);
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
      tag: isFromUndoManger ? HISTORIC_TAG : SKIP_COLLAB_TAG,
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
  console.log('🚀 [SyncLexicalUpdateToCRDT] STARTING SYNC:', {
    dirtyElementsCount: dirtyElements.size,
    dirtyElementsKeys: Array.from(dirtyElements.keys()),
    dirtyLeavesCount: dirtyLeaves.size,
    dirtyLeavesKeys: Array.from(dirtyLeaves),
    normalizedNodesCount: normalizedNodes.size,
    normalizedNodesKeys: Array.from(normalizedNodes),
    tagsArray: Array.from(tags),
    hasRootInDirtyElements: dirtyElements.has('root'),
    bindingRootKey: binding?.root?._key,
    collabNodeMapSize: binding?.collabNodeMap?.size,
    bindingRootIsEmpty: binding?.root?.isEmpty(),
    bindingRootHasSharedType: !!binding?.root?.getSharedType(),
    // Detailed dirty elements inspection
    dirtyElementsDetailed: Array.from(dirtyElements.entries()).map(([key, value]) => ({key, value}))
  });
  
  syncWithTransaction(binding, () => {
    console.log('🔄 syncLexicalUpdateToCRDT: Inside syncWithTransaction');
    currEditorState.read(() => {
      console.log('📖 syncLexicalUpdateToCRDT: Inside currEditorState.read()');
      
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
        console.log('⏭️ syncLexicalUpdateToCRDT: Skipping - has collab/historic tag');
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
        console.log('🌳 [SyncLexicalUpdateToCRDT] Processing root dirty element');
        const prevNodeMap = prevEditorState._nodeMap;
        const nextLexicalRoot = $getRoot();
        const collabRoot = binding.root;
        
        console.log('� [SyncLexicalUpdateToCRDT] Root analysis:', {
          lexicalRootKey: nextLexicalRoot.getKey(),
          lexicalRootType: nextLexicalRoot.getType(),
          lexicalRootChildrenCount: nextLexicalRoot.getChildren().length,
          lexicalRootChildrenKeys: nextLexicalRoot.getChildren().map(c => c.getKey()),
          lexicalRootChildrenTypes: nextLexicalRoot.getChildren().map(c => c.getType()),
          collabRootKey: collabRoot._key,
          collabRootType: collabRoot.getType(),
          collabRootIsEmpty: collabRoot.isEmpty(),
          collabRootHasSharedType: !!collabRoot.getSharedType(),
          isRootInCollabNodeMap: binding.collabNodeMap.has('root'),
          collabNodeMapHasLexicalRoot: binding.collabNodeMap.has(nextLexicalRoot.getKey())
        });
        
        console.log('�🔧 [SyncLexicalUpdateToCRDT] Calling syncPropertiesFromLexical');
        collabRoot.syncPropertiesFromLexical(
          binding,
          nextLexicalRoot,
          prevNodeMap,
        );
        
        console.log('👶 [SyncLexicalUpdateToCRDT] Calling syncChildrenFromLexical');
        collabRoot.syncChildrenFromLexical(
          binding,
          nextLexicalRoot,
          prevNodeMap,
          dirtyElements,
          dirtyLeaves,
        );
        
        console.log('✅ [SyncLexicalUpdateToCRDT] Root processing complete');
      } else {
        console.log('⚠️ [SyncLexicalUpdateToCRDT] No root in dirty elements - this might be the problem!');
        console.log('🔍 [SyncLexicalUpdateToCRDT] Dirty elements analysis:', {
          dirtyElementsKeys: Array.from(dirtyElements.keys()),
          dirtyElementsSize: dirtyElements.size,
          lexicalRootExists: !!$getRoot(),
          lexicalRootKey: $getRoot().getKey(),
          lexicalRootChildrenCount: $getRoot().getChildren().length
        });
      }

      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      console.log('👆 syncLexicalUpdateToCRDT: Calling syncLexicalSelectionToCRDT');
      syncLexicalSelectionToCRDT(binding, provider, prevSelection, selection);
    });
  });
}