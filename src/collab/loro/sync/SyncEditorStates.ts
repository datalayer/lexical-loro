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
    
    // Special handling for text events that should be processed directly
    if (event.diff && event.diff.type === 'text' && target.includes(':Text')) {
      console.log('$syncEvent: Direct text event detected:', target, event.diff);
      
      // Extract text content from the text diff array
      let textContent = '';
      if (Array.isArray(event.diff.diff)) {
        for (const op of event.diff.diff) {
          if (op && typeof op === 'object') {
            if (op.insert && typeof op.insert === 'string') {
              textContent += op.insert;
              console.log('$syncEvent: Found text insert in direct text event:', op.insert);
            }
          }
        }
      }
      
      if (textContent && textContent.trim()) {
        console.log('$syncEvent: Processing direct text content:', JSON.stringify(textContent));
        
        // Find the appropriate element to update
        const match = target.match(/^cid:root-(.+):Text$/);
        if (match) {
          const containerId = match[1];
          console.log('$syncEvent: Looking for element to update with text content, container:', containerId);
          
          // Find the appropriate element node
          for (const [key, node] of binding.collabNodeMap.entries()) {
            if ((containerId === 'root' && node._key === 'root') ||
                (containerId.startsWith('element_') && node._key === containerId.replace('element_', ''))) {
              console.log('$syncEvent: Checking element for direct text content:', key, node._type);
              
              // Root node cannot contain text directly - only element nodes can contain text
              if (node._type === 'paragraph' || node._type === 'heading') {
                console.log('$syncEvent: Updating element with direct text content:', key, node._type);
                (node as CollabElementNode).syncTextContentFromCRDT(binding, textContent);
              } else if (node._type === 'root') {
                console.log('$syncEvent: Skipping root node - cannot contain text directly');
                // For root text events, we need to find child paragraph elements to update
                for (const [childKey, childNode] of binding.collabNodeMap.entries()) {
                  if (childNode._type === 'paragraph' || childNode._type === 'heading') {
                    console.log('$syncEvent: Updating child element instead:', childKey, childNode._type);
                    (childNode as CollabElementNode).syncTextContentFromCRDT(binding, textContent);
                    break; // Update first available paragraph
                  }
                }
              }
              
              return; // Exit early since we processed the text content
            }
          }
        }
      } else {
        console.log('$syncEvent: Skipping empty or whitespace-only text content');
        return; // Exit early for empty text events
      }
    }
    
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
      // Try to create missing collaboration node on-demand
      // The key insight: we need to determine the node type from the container ID pattern and event data
      console.log('$syncEvent: Creating missing collaboration node for:', containerId, containerType);
      
      try {
        let sharedType;
        let nodeType;
        
        // Debug: Check what the binding.doc API looks like
        console.log('$syncEvent: binding.doc:', binding.doc, 'type:', typeof binding.doc, 'constructor:', binding.doc?.constructor?.name);
        console.log('$syncEvent: binding.doc.getMap:', binding.doc?.getMap, 'type:', typeof binding.doc?.getMap);
        console.log('$syncEvent: binding.doc.getText:', binding.doc?.getText, 'type:', typeof binding.doc?.getText);
        console.log('$syncEvent: binding.doc.getList:', binding.doc?.getList, 'type:', typeof binding.doc?.getList);
        
        // Determine node type from container ID pattern
        console.log('$syncEvent: Analyzing container pattern:', containerId, containerType);
        
        if (containerId === 'root') {
          nodeType = 'root';
          sharedType = new XmlText(binding.doc, containerId);
          console.log('$syncEvent: Created XmlText for root:', sharedType);
        } else if (containerId.startsWith('element_')) {
          // For elements, we need to infer the type from context or default to paragraph
          nodeType = 'paragraph'; // Default for now, could be improved with more context
          sharedType = new XmlText(binding.doc, containerId);
          console.log('$syncEvent: Created XmlText for element:', sharedType);
        } else if (containerId.startsWith('text_')) {
          // For text nodes, default to text type
          nodeType = 'text';
          console.log('$syncEvent: About to call binding.doc.getMap for:', containerId);
          sharedType = binding.doc.getMap(containerId);
          console.log('$syncEvent: binding.doc.getMap returned:', sharedType, 'type:', typeof sharedType, 'constructor:', sharedType?.constructor?.name);
        } else if (containerId.startsWith('linebreak_')) {
          nodeType = 'linebreak';
          sharedType = binding.doc.getMap(containerId);
          console.log('$syncEvent: Created LoroMap for linebreak:', sharedType);
        } else if (containerId.startsWith('decorator_')) {
          // For decorators, we'd need more context to determine the exact type
          nodeType = 'decorator'; // This would need to be more specific in real usage
          sharedType = binding.doc.getMap(containerId);
          console.log('$syncEvent: Created LoroMap for decorator:', sharedType);
        }
        
        if (sharedType && nodeType) {
          console.log('$syncEvent: About to set __type:', nodeType, 'on sharedType:', sharedType?.constructor?.name);
          
          // Set the __type before calling $getOrInitCollabNodeFromSharedType
          try {
            if (sharedType instanceof XmlText) {
              sharedType.setAttribute('__type', nodeType);
              console.log('$syncEvent: Set __type on XmlText successfully');
            } else if (sharedType instanceof LoroMap) {
              sharedType.set('__type', nodeType);
              console.log('$syncEvent: Set __type on LoroMap successfully');
            } else {
              console.warn('$syncEvent: Unknown sharedType type for __type setting:', sharedType?.constructor?.name, typeof sharedType);
            }
            
            console.log('$syncEvent: About to call $getOrInitCollabNodeFromSharedType with:', sharedType);
            
            // For text nodes, don't create new CollabTextNode instances
            // Instead, sync the text content to the parent element
            if (nodeType === 'text') {
              console.log('$syncEvent: Handling text content update for text container');
              console.log('$syncEvent: Text event data:', event);
              console.log('$syncEvent: Event diff type:', event.diff?.type);
              console.log('$syncEvent: Full event object:', JSON.stringify(event, null, 2));
              
              // The key insight: text content in Loro might be stored differently
              // Let's check if this is actually a Text container, not a Map
              // Look at the original event to understand the structure
              
              // Try to get the text content from the Text container directly
              // In Loro, text content might be accessible via different APIs
              let textContent = '';
              
              // Check if we can access the actual text content from different sources
              try {
                // For Loro, text content might be stored in a separate Text container
                // First, try to find the corresponding Text container for this text node
                
                // Option 1: Try getting the Text container with the same ID
                const textContainer = binding.doc.getText(containerId);
                console.log('$syncEvent: Text container from getText:', textContainer, typeof textContainer);
                
                if (textContainer && typeof textContainer.toString === 'function') {
                  textContent = textContainer.toString();
                  console.log('$syncEvent: Text content from getText().toString():', textContent);
                  
                  // If toString() is empty, try other methods
                  if (!textContent && typeof textContainer.toDelta === 'function') {
                    const delta = textContainer.toDelta();
                    console.log('$syncEvent: Text content from toDelta():', delta);
                    // Extract text from delta format
                    if (Array.isArray(delta)) {
                      textContent = delta.map(op => op.insert || '').join('');
                      console.log('$syncEvent: Extracted text from delta:', textContent);
                    }
                  }
                  
                  // If still empty, try accessing the container's internal structure
                  if (!textContent) {
                    console.log('$syncEvent: Trying alternative text access methods');
                    console.log('$syncEvent: textContainer properties:', Object.getOwnPropertyNames(textContainer));
                    console.log('$syncEvent: textContainer.__proto__:', Object.getOwnPropertyNames(Object.getPrototypeOf(textContainer)));
                    
                    // Try common text container methods
                    if (typeof textContainer.length !== 'undefined') {
                      console.log('$syncEvent: Text container length:', textContainer.length);
                    }
                    if (typeof textContainer.slice === 'function') {
                      try {
                        // Try different slice parameters
                        const length = textContainer.length || 0;
                        const slicedText = textContainer.slice(0, length);
                        console.log('$syncEvent: Text from slice(0, length):', slicedText);
                        if (typeof slicedText === 'string') {
                          textContent = slicedText;
                        }
                      } catch (sliceError) {
                        console.log('$syncEvent: Error with slice:', sliceError);
                      }
                    }
                  }
                }
                
                // Option 2: Look for text content in the event's diff data directly
                if (!textContent && event.diff && event.diff.type === 'text' && Array.isArray(event.diff.diff)) {
                  console.log('$syncEvent: Processing text diff array from event:', event.diff.diff);
                  
                  // Text diff format: array of operations
                  for (const op of event.diff.diff) {
                    if (op && typeof op === 'object') {
                      if (op.insert && typeof op.insert === 'string') {
                        textContent += op.insert;
                        console.log('$syncEvent: Found text insert operation:', op.insert);
                      }
                    }
                  }
                }
              } catch (textError) {
                console.log('$syncEvent: Error accessing as Text container:', textError);
                
                // Fallback: check if the event itself contains the text
                if (event.diff && event.diff.type === 'text' && Array.isArray(event.diff.diff)) {
                  console.log('$syncEvent: Processing text diff array:', event.diff.diff);
                  
                  // Text diff format: array of operations
                  for (const op of event.diff.diff) {
                    if (op && typeof op === 'object') {
                      if (op.insert && typeof op.insert === 'string') {
                        textContent += op.insert;
                        console.log('$syncEvent: Found text insert operation:', op.insert);
                      }
                    }
                  }
                } else if (event.diff && event.diff.type === 'map') {
                  // This is what we were doing before - check Map properties
                  console.log('$syncEvent: Processing map-type diff for text properties');
                  const diffUpdated = event.diff?.updated;
                  if (diffUpdated) {
                    console.log('$syncEvent: Checking diff updated for text content:', diffUpdated);
                    // Look for text-like properties
                    for (const [key, value] of Object.entries(diffUpdated)) {
                      if (typeof value === 'string' && value.length > 0 && key !== '__type' && key !== '__style') {
                        console.log(`$syncEvent: Found potential text content in ${key}:`, value);
                        textContent = value;
                        break;
                      }
                    }
                  }
                }
              }
              
              console.log('$syncEvent: Final text content to sync:', JSON.stringify(textContent));
              
              // Only update if we have non-empty text content
              if (textContent && textContent.trim()) {
                // Find the parent element that should contain this text
                for (const [key, node] of binding.collabNodeMap.entries()) {
                  if (node._type === 'paragraph' || node._type === 'heading') {
                    console.log('$syncEvent: Syncing text content to parent element:', key, node._type);
                    
                    if (typeof textContent === 'string') {
                      // Update the element's text content
                      (node as CollabElementNode).syncTextContentFromCRDT(binding, textContent);
                    }
                    break;
                  }
                }
              } else {
                console.log('$syncEvent: Skipping empty text content sync to avoid overwriting existing text');
              }
            } else {
              // For non-text nodes, create CollabNode normally
              const createdCollabNode = $getOrInitCollabNodeFromSharedType(binding, sharedType);
              if (createdCollabNode) {
                console.log('$syncEvent: Successfully created collab node for', target, ':', createdCollabNode);
                processCollabNodeEvent(binding, createdCollabNode, event);
              } else {
                console.warn('$syncEvent: Failed to create collaboration node for:', containerId, containerType);
              }
            }
          } catch (setTypeError) {
            console.error('$syncEvent: Error setting __type:', setTypeError);
          }
        } else {
          console.warn('$syncEvent: Could not determine node type for:', containerId, containerType, 'sharedType:', sharedType, 'nodeType:', nodeType);
        }
      } catch (error) {
        console.warn('$syncEvent: Error creating collaboration node:', containerId, containerType, error);
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
  console.log('[syncLexicalUpdateToCRDT] Called with:', {
    dirtyElements: Array.from(dirtyElements.keys()),
    dirtyLeaves: Array.from(dirtyLeaves),
    normalizedNodes: Array.from(normalizedNodes),
    tags: Array.from(tags)
  });
  
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
        console.log('[syncLexicalUpdateToCRDT] Skipping due to collaboration/historic tag');
        if (normalizedNodes.size > 0) {
          $handleNormalizationMergeConflicts(binding, normalizedNodes);
        }

        return;
      }

      if (dirtyElements.has('root')) {
        console.log('[syncLexicalUpdateToCRDT] Root is dirty, syncing children');
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
      } else {
        console.log('[syncLexicalUpdateToCRDT] Root is not dirty, no sync needed');
      }

      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      syncLexicalSelectionToCRDT(binding, provider, prevSelection, selection);
    });
  });
}
