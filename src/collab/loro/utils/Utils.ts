import {
  $getNodeByKey,
  $getRoot,
  $getWritableNodeState,
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isRootNode,
  $isTextNode,
  createEditor,
  DecoratorNode,
  EditorState,
  ElementNode,
  LexicalNode,
  NodeKey,
  RangeSelection,
  TextNode,
} from 'lexical';
import {LoroMap, LoroDoc} from 'loro-crdt';
import invariant from '../../utils/invariant';
import {XmlText} from './../types/XmlText';
import type {CRDTNode} from './../State';
import {
  $createCollabDecoratorNode,
  CollabDecoratorNode,
} from './../nodes/CollabDecoratorNode';
import {$createCollabElementNode, CollabElementNode} from './../nodes/CollabElementNode';
import {
  $createCollabLineBreakNode,
  CollabLineBreakNode,
} from './../nodes/CollabLineBreakNode';
import {$createCollabTextNode, CollabTextNode} from './../nodes/CollabTextNode';
import { Binding } from '../Bindings';

const baseExcludedProperties = new Set<string>([
  '__key',
  '__parent',
  '__next',
  '__prev',
  '__state',
]);
const elementExcludedProperties = new Set<string>([
  '__first',
  '__last',
  '__size',
  '__dir',
]);
const rootExcludedProperties = new Set<string>(['__cachedText']);
const textExcludedProperties = new Set<string>(['__text']);

function isExcludedProperty(
  name: string,
  node: LexicalNode,
  binding: Binding,
): boolean {
  if (
    baseExcludedProperties.has(name) ||
    typeof (node as unknown as Record<string, unknown>)[name] === 'function'
  ) {
    return true;
  }

  if ($isTextNode(node)) {
    if (textExcludedProperties.has(name)) {
      return true;
    }
  } else if ($isElementNode(node)) {
    if (
      elementExcludedProperties.has(name) ||
      ($isRootNode(node) && rootExcludedProperties.has(name))
    ) {
      return true;
    }
  }

  const nodeKlass = node.constructor;
  const excludedProperties = binding.excludedProperties.get(nodeKlass);
  return excludedProperties != null && excludedProperties.has(name);
}

export function getIndexOfCRDTNode(
  loroParentNode: CRDTNode,
  loroNode: CRDTNode,
): number {
  let node = loroParentNode.firstChild;
  let i = -1;

  if (node === null) {
    return -1;
  }

  do {
    i++;

    if (node === loroNode) {
      return i;
    }

    // @ts-expect-error Sibling exists but type is not available from YJS.
    node = node.nextSibling;

    if (node === null) {
      return -1;
    }
  } while (node !== null);

  return i;
}

export function $createCollabNodeFromLexicalNode(
  binding: Binding,
  lexicalNode: LexicalNode,
  parent: CollabElementNode,
):
  | CollabElementNode
  | CollabTextNode
  | CollabLineBreakNode
  | CollabDecoratorNode {
  const nodeType = lexicalNode.__type;
  let collabNode;

  console.log(`🏭 [NODE-CREATION] Creating CollabNode for Lexical node:`, {
    nodeKey: lexicalNode.__key,
    nodeType: nodeType,
    isElement: $isElementNode(lexicalNode),
    isText: $isTextNode(lexicalNode),
    isLineBreak: $isLineBreakNode(lexicalNode),
    isDecorator: $isDecoratorNode(lexicalNode),
    textContent: $isTextNode(lexicalNode) ? (lexicalNode as any).__text : 'N/A'
  });

  if ($isElementNode(lexicalNode)) {
    const xmlText = new XmlText(binding.doc, `element_${lexicalNode.__key}`);
    xmlText.setAttribute('__type', nodeType);
    collabNode = $createCollabElementNode(xmlText, parent, nodeType);
    console.log(`🏭 [NODE-CREATION] Created CollabElementNode for ${nodeType}, key: ${lexicalNode.__key}`);
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
    collabNode.syncChildrenFromLexical(binding, lexicalNode, null, null, null);
  } else if ($isTextNode(lexicalNode)) {
    // TODO create a token text node for token, segmented nodes.
    const map = binding.doc.getMap(`text_${lexicalNode.__key}`);
    map.set('__type', nodeType);
    collabNode = $createCollabTextNode(
      map,
      lexicalNode.__text,
      parent,
      nodeType,
    );
    console.log(`🏭 [NODE-CREATION] Created CollabTextNode for ${nodeType}, key: ${lexicalNode.__key}, text: "${(lexicalNode as any).__text}"`);
    collabNode.syncPropertiesAndTextFromLexical(binding, lexicalNode, null);
  } else if ($isLineBreakNode(lexicalNode)) {
    const map = binding.doc.getMap(`linebreak_${lexicalNode.__key}`);
    map.set('__type', 'linebreak');
    collabNode = $createCollabLineBreakNode(map, parent);
  } else if ($isDecoratorNode(lexicalNode)) {
    const map = binding.doc.getMap(`decorator_${lexicalNode.__key}`);
    map.set('__type', nodeType);
    collabNode = $createCollabDecoratorNode(map, parent, nodeType);
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
  } else {
    invariant(false, 'Expected text, element, decorator, or linebreak node');
  }

  collabNode._key = lexicalNode.__key;
  return collabNode;
}

export function getNodeTypeFromSharedType(
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
): string | undefined {
  const type = sharedTypeGet(sharedType, '__type');
  invariant(
    typeof type === 'string' || typeof type === 'undefined',
    'Expected shared type to include type attribute',
  );
  return type;
}

export function $getOrInitCollabNodeFromSharedType(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  parent?: CollabElementNode,
):
  | CollabElementNode
  | CollabTextNode
  | CollabLineBreakNode
  | CollabDecoratorNode {
  const collabNode = (sharedType as any)._collabNode;

  if (collabNode === undefined) {
    const registeredNodes = binding.editor._nodes;
    const type = getNodeTypeFromSharedType(sharedType);
    invariant(
      typeof type === 'string',
      'Expected shared type to include type attribute',
    );
    const nodeInfo = registeredNodes.get(type);
    invariant(nodeInfo !== undefined, 'Node %s is not registered', type);

    const sharedParent = sharedType.parent;
    const targetParent =
      parent === undefined && sharedParent !== null
        ? $getOrInitCollabNodeFromSharedType(
            binding,
            sharedParent as XmlText | LoroMap<Record<string, unknown>>,
          )
        : parent || null;

    invariant(
      targetParent instanceof CollabElementNode,
      'Expected parent to be a collab element node',
    );

    if (sharedType instanceof XmlText) {
      return $createCollabElementNode(sharedType, targetParent, type);
    } else if (sharedType instanceof LoroMap) {
      if (type === 'linebreak') {
        return $createCollabLineBreakNode(sharedType, targetParent);
      }
      return $createCollabTextNode(sharedType, '', targetParent, type);
    } else {
      // This case shouldn't normally happen with our current types
      invariant(false, 'Unexpected shared type: %s', (sharedType as any)?.constructor?.name);
    }
  }

  return collabNode;
}

export function createLexicalNodeFromCollabNode(
  binding: Binding,
  collabNode:
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode,
  parentKey: NodeKey,
): LexicalNode {
  const type = collabNode.getType();
  const registeredNodes = binding.editor._nodes;
  const nodeInfo = registeredNodes.get(type);
  invariant(nodeInfo !== undefined, 'Node %s is not registered', type);
  const lexicalNode:
    | DecoratorNode<unknown>
    | TextNode
    | ElementNode
    | LexicalNode = new nodeInfo.klass();
  lexicalNode.__parent = parentKey;
  collabNode._key = lexicalNode.__key;

  if (collabNode instanceof CollabElementNode) {
    const xmlText = collabNode._xmlText;
    collabNode.syncPropertiesFromCRDT(binding, null);
    collabNode.applyChildrenCRDTDelta(binding, xmlText.toDelta());
    collabNode.syncChildrenFromCRDT(binding);
  } else if (collabNode instanceof CollabTextNode) {
    console.log(`🔧 [NODE-CREATION] Processing CollabTextNode, _map:`, collabNode._map);
    collabNode.syncPropertiesAndTextFromCRDT(binding, null);
    // Also register CollabTextNode by its Map ID so events can find it
    const mapId = (collabNode._map as any).id;
    console.log(`🔧 [NODE-CREATION] CollabTextNode Map ID extracted:`, mapId);
    if (mapId) {
      binding.collabNodeMap.set(mapId, collabNode);
      console.log(`🔧 [NODE-CREATION] ✅ Registered CollabTextNode with Map ID: ${mapId}`);
    } else {
      console.warn(`⚠️ [NODE-CREATION] CollabTextNode has no Map ID!`);
    }
  } else if (collabNode instanceof CollabDecoratorNode) {
    collabNode.syncPropertiesFromCRDT(binding, null);
  }

  binding.collabNodeMap.set(lexicalNode.__key, collabNode);
  return lexicalNode;
}

export function $syncPropertiesFromCRDT(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  lexicalNode: LexicalNode,
  keysChanged: null | Set<string>,
): void {
  console.log(`🔧 [SYNC-PROPS-ENTRY] $syncPropertiesFromCRDT called with keysChanged:`, keysChanged ? Array.from(keysChanged) : 'null');
  
  const properties =
    keysChanged === null
      ? sharedType instanceof LoroMap
        ? Array.from(sharedType.keys())
        : Object.keys(sharedType.getAttributes())
      : Array.from(keysChanged);
      
  console.log(`🔧 [SYNC-PROPS-PROPERTIES] Properties to process:`, properties);
  let writableNode: LexicalNode | undefined;

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    if (isExcludedProperty(property, lexicalNode, binding)) {
      if (property === '__state') {
        if (!writableNode) {
          writableNode = lexicalNode.getWritable();
        }
        $syncNodeStateToLexical(binding, sharedType, writableNode);
      }
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevValue = (lexicalNode as any)[property];
    let nextValue = sharedTypeGet(sharedType, property);

    // Debug logging for ALL properties to understand what's happening
    console.log(`🔧 [SYNC-PROPS-ALL] Property: ${property}, nextValue:`, nextValue, typeof nextValue);
    
    // Debug logging for embed properties
    if (property.startsWith('embed_')) {
      console.log(`🔧 [SYNC-PROPS-DEBUG] Found embed property: ${property}, nextValue:`, nextValue, typeof nextValue);
    }

    // Special handling for embed properties - these reference CollabTextNodes
    if (property.startsWith('embed_') && nextValue) {
      console.log(`🔧 [SYNC-PROPS] Processing embed property: ${property}`, nextValue);
      
      // The embed property value might be the LoroMap directly, or a reference
      let map: any = null;
      let objectId: string | null = null;
      
      if (typeof nextValue === 'object') {
        const anyValue = nextValue as any;
        
        // Case 1: nextValue is an embed object with object.id
        if (anyValue.object && anyValue.object.id) {
          objectId = anyValue.object.id;
          console.log(`🔧 [SYNC-PROPS] Found embed object ID: ${objectId}`);
          console.log(`🔧 [SYNC-PROPS] Embed object full structure:`, anyValue);
          
          if (objectId.endsWith(':Map')) {
            try {
              map = binding.doc.getMap(objectId);
            } catch (error) {
              console.warn(`⚠️ [SYNC-PROPS] Could not get map for ${objectId}:`, error);
            }
          } else {
            console.log(`🔧 [SYNC-PROPS] ObjectId does not end with :Map, checking if it's an element reference`);
          }
        }
        // Case 2: nextValue is the LoroMap directly
        else if (anyValue.constructor && anyValue.constructor.name === 'LoroMap') {
          map = nextValue;
          objectId = anyValue.id || 'unknown-map-id';
          console.log(`🔧 [SYNC-PROPS] nextValue is LoroMap directly, id: ${objectId}`);
        }
        // Case 3: Check for other map-like structures
        else if (anyValue.get && typeof anyValue.get === 'function') {
          map = nextValue;
          objectId = anyValue.id || 'map-like-object';
          console.log(`🔧 [SYNC-PROPS] nextValue has get method (map-like), treating as LoroMap`);
        }
      }
      
      // Process the map if we found one
      if (map && objectId) {
        console.log(`🔧 [SYNC-PROPS] Processing map with ID: ${objectId}`);
        
        try {
          // Check if this map represents a text node
          const mapType = map.get('__type');
          console.log(`🔧 [SYNC-PROPS] Map __type: ${mapType}`);
          
          if (mapType === 'text' || objectId.includes(':text_')) {
            console.log(`🔧 [SYNC-PROPS] This is a text node embed, creating CollabTextNode`);
            
            // Get the CollabElementNode from the lexical node
            const collabElementNode = binding.collabNodeMap.get(lexicalNode.getKey());
            if (collabElementNode && 'append' in collabElementNode) {
              console.log(`🔧 [SYNC-PROPS] Found CollabElementNode, creating CollabTextNode`);
              
              // Check if CollabTextNode already exists
              const existingNode = binding.collabNodeMap.get(objectId);
              if (existingNode) {
                console.log(`🔧 [SYNC-PROPS] CollabTextNode already exists for ${objectId}`);
                return;
              }
              
              // Create CollabTextNode
              const textContent = map.get('__text') || '';
              const collabTextNode = $createCollabTextNode(map, textContent, collabElementNode as any, 'text');
              
              // Set a proper key for the CollabTextNode (extract from objectId)
              const textNodeKey = objectId.replace('cid:root-', '').replace(':Map', '');
              collabTextNode._key = textNodeKey;
              
              // CRITICAL: Register the CollabTextNode in the binding so it can be found by future events
              binding.collabNodeMap.set(objectId, collabTextNode);
              binding.collabNodeMap.set(textNodeKey, collabTextNode);
              console.log(`🔧 [SYNC-PROPS] ✅ Registered CollabTextNode in binding for ${objectId} with key ${textNodeKey}`);
              
              // Add to CollabElementNode children if not already present
              const children = (collabElementNode as any)._children;
              if (children && !children.includes(collabTextNode)) {
                children.push(collabTextNode);
                console.log(`🔧 [SYNC-PROPS] ✅ Added CollabTextNode to CollabElementNode children`);
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ [SYNC-PROPS] Error processing embed map:', error);
        }
      } else {
        console.log(`🔧 [SYNC-PROPS] No map found or objectId missing - map: ${!!map}, objectId: ${objectId}`);
      }
      
      // Continue with normal property processing
    }

    if (prevValue !== nextValue) {
      if (nextValue instanceof LoroDoc) {
        const docMap = binding.docMap;

        if (prevValue instanceof LoroDoc) {
          // TODO: Handle document cleanup
        }

        const nestedEditor = createEditor();
        const key = nextValue.peerId.toString();
        nestedEditor._key = key;
        docMap.set(key, nextValue);

        nextValue = nestedEditor;
      }

      if (writableNode === undefined) {
        writableNode = lexicalNode.getWritable();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      writableNode[property as keyof typeof writableNode] = nextValue as any;
    }
  }
}

function sharedTypeGet(
  sharedType: any,
  property: string,
): unknown {
  if (sharedType instanceof LoroMap) {
    return sharedType.get(property);
  } else if (sharedType instanceof XmlText) {
    return sharedType.getAttribute(property);
  } else if (sharedType && typeof sharedType.getAttribute === 'function') {
    // Try getAttribute if it exists
    return sharedType.getAttribute(property);
  } else if (sharedType && typeof sharedType.get === 'function') {
    // Try get if it exists (for other Loro containers)
    return sharedType.get(property);
  } else {
    // Handle other Loro types that might not have getAttribute or get method
    console.warn('sharedTypeGet: Unsupported type for property access:', sharedType?.constructor?.name || typeof sharedType, property);
    return undefined;
  }
}

function sharedTypeSet(
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  property: string,
  nextValue: unknown,
): void {
  if (sharedType instanceof LoroMap) {
    sharedType.set(property, nextValue);
  } else {
    sharedType.setAttribute(property, nextValue as string);
  }
}

function $syncNodeStateToLexical(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  lexicalNode: LexicalNode,
): void {
  const existingState = sharedTypeGet(sharedType, '__state');
  if (!(existingState instanceof LoroMap)) {
    return;
  }
  // This should only called when creating the node initially,
  // incremental updates to state come in through LoroMap events
  // with the __state as the target.
  $getWritableNodeState(lexicalNode).updateFromJSON(existingState.toJSON());
}

function syncNodeStateFromLexical(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  prevLexicalNode: null | LexicalNode,
  nextLexicalNode: LexicalNode,
): void {
  const nextState = nextLexicalNode.__state;
  const existingState = sharedTypeGet(sharedType, '__state');
  if (!nextState) {
    return;
  }
  const [unknown, known] = nextState.getInternalState();
  const prevState = prevLexicalNode && prevLexicalNode.__state;
  const stateMap: LoroMap<Record<string, unknown>> =
    existingState instanceof LoroMap ? existingState : binding.doc.getMap('nodestate_' + nextLexicalNode.__key);
  if (prevState === nextState) {
    return;
  }
  const [prevUnknown, prevKnown] =
    prevState && stateMap
      ? prevState.getInternalState()
      : [undefined, new Map()];
  if (unknown) {
    for (const [k, v] of Object.entries(unknown)) {
      if (prevUnknown && v !== prevUnknown[k]) {
        stateMap.set(k, v);
      }
    }
  }
  for (const [stateConfig, v] of known) {
    if (prevKnown.get(stateConfig) !== v) {
      stateMap.set(stateConfig.key, stateConfig.unparse(v));
    }
  }
  if (!existingState) {
    sharedTypeSet(sharedType, '__state', stateMap);
  }
}

export function syncPropertiesFromLexical(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  prevLexicalNode: null | LexicalNode,
  nextLexicalNode: LexicalNode,
): void {
  const type = nextLexicalNode.__type;
  const nodeProperties = binding.nodeProperties;
  let properties = nodeProperties.get(type);
  if (properties === undefined) {
    properties = Object.keys(nextLexicalNode).filter((property) => {
      return !isExcludedProperty(property, nextLexicalNode, binding);
    });
    nodeProperties.set(type, properties);
  }

  const EditorClass = binding.editor.constructor;

  syncNodeStateFromLexical(
    binding,
    sharedType,
    prevLexicalNode,
    nextLexicalNode,
  );
  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const prevValue =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prevLexicalNode === null ? undefined : (prevLexicalNode as any)[property];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let nextValue = (nextLexicalNode as any)[property];

    if (prevValue !== nextValue) {
      if (nextValue instanceof EditorClass) {
        const docMap = binding.docMap;
        let prevDoc;

        if (prevValue instanceof EditorClass) {
          const prevKey = prevValue._key;
          prevDoc = docMap.get(prevKey);
          docMap.delete(prevKey);
        }

        // If we already have a document, use it, otherwise create new LoroDoc
        const doc = prevDoc || new LoroDoc();
        const key = doc.peerId.toString();
        nextValue._key = key;
        docMap.set(key, doc);
        nextValue = doc;
        // Mark the node dirty as we've assigned a new key to it
        binding.editor.update(() => {
          nextLexicalNode.markDirty();
        });
      }

      sharedTypeSet(sharedType, property, nextValue);
    }
  }
}

export function spliceString(
  str: string,
  index: number,
  delCount: number,
  newText: string,
): string {
  return str.slice(0, index) + newText + str.slice(index + delCount);
}

export function getPositionFromElementAndOffset(
  node: CollabElementNode,
  offset: number,
  boundaryIsEdge: boolean,
): {
  length: number;
  node:
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode
    | null;
  nodeIndex: number;
  offset: number;
} {
  let index = 0;
  let i = 0;
  const children = node._children;
  const childrenLength = children.length;

  for (; i < childrenLength; i++) {
    const child = children[i];
    const childOffset = index;
    const size = child.getSize();
    index += size;
    const exceedsBoundary = boundaryIsEdge ? index >= offset : index > offset;

    if (exceedsBoundary && child instanceof CollabTextNode) {
      let textOffset = offset - childOffset - 1;

      if (textOffset < 0) {
        textOffset = 0;
      }

      const diffLength = index - offset;
      return {
        length: diffLength,
        node: child,
        nodeIndex: i,
        offset: textOffset,
      };
    }

    if (index > offset) {
      return {
        length: 0,
        node: child,
        nodeIndex: i,
        offset: childOffset,
      };
    } else if (i === childrenLength - 1) {
      return {
        length: 0,
        node: null,
        nodeIndex: i + 1,
        offset: childOffset + 1,
      };
    }
  }

  return {
    length: 0,
    node: null,
    nodeIndex: 0,
    offset: 0,
  };
}

export function doesSelectionNeedRecovering(
  selection: RangeSelection,
): boolean {
  const anchor = selection.anchor;
  const focus = selection.focus;
  let recoveryNeeded = false;

  try {
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();

    if (
      // We might have removed a node that no longer exists
      !anchorNode.isAttached() ||
      !focusNode.isAttached() ||
      // If we've split a node, then the offset might not be right
      ($isTextNode(anchorNode) &&
        anchor.offset > anchorNode.getTextContentSize()) ||
      ($isTextNode(focusNode) && focus.offset > focusNode.getTextContentSize())
    ) {
      recoveryNeeded = true;
    }
  } catch (e) {
    // Sometimes checking nor a node via getNode might trigger
    // an error, so we need recovery then too.
    recoveryNeeded = true;
  }

  return recoveryNeeded;
}

export function syncWithTransaction(binding: Binding, fn: () => void): void {
  // For now, just call the function directly
  // Loro should handle change batching automatically
  try {
    fn();
  } catch (error) {
    console.error('❌ [syncWithTransaction] Error in sync transaction:', error);
    throw error;
  }
}

export function $moveSelectionToPreviousNode(
  anchorNodeKey: string,
  currentEditorState: EditorState,
) {
  const anchorNode = currentEditorState._nodeMap.get(anchorNodeKey);
  if (!anchorNode) {
    $getRoot().selectStart();
    return;
  }
  // Get previous node
  const prevNodeKey = anchorNode.__prev;
  let prevNode: ElementNode | null = null;
  if (prevNodeKey) {
    prevNode = $getNodeByKey(prevNodeKey);
  }

  // If previous node not found, get parent node
  if (prevNode === null && anchorNode.__parent !== null) {
    prevNode = $getNodeByKey(anchorNode.__parent);
  }
  if (prevNode === null) {
    $getRoot().selectStart();
    return;
  }

  if (prevNode !== null && prevNode.isAttached()) {
    prevNode.selectEnd();
    return;
  } else {
    // If the found node is also deleted, select the next one
    $moveSelectionToPreviousNode(prevNode.__key, currentEditorState);
  }
}
