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
import {LoroMap, LoroDoc, ContainerID} from 'loro-crdt';
import {XmlText} from '../types/XmlText';
import invariant from '../../utils/invariant';
import type {CRDTNode} from '../State';
import { Binding } from '../Bindings';
import {
  $createCollabDecoratorNode,
  CollabDecoratorNode,
} from '../nodes/CollabDecoratorNode';
import {$createCollabElementNode, CollabElementNode} from '../nodes/CollabElementNode';
import {$createCollabLineBreakNode} from '../nodes/CollabLineBreakNode';
import {$createCollabTextNode, CollabTextNode} from '../nodes/CollabTextNode';
import {AnyCollabNode} from '../nodes/AnyCollabNode';

/*****************************************************************************/

const BASE_EXCLUDED_PROPERTIES = new Set<string>([
  '__key',
  '__parent',
  '__next',
  '__prev',
  '__state',
]);

const ELEMENT_EXCLUDED_PROPERTIES = new Set<string>([
  '__first',
  '__last',
  '__size',
  '__dir',
]);

const ROOT_EXCLUDED_PROPERTIES = new Set<string>(['__cachedText']);

const TEXT_EXCLUDED_PROPERTIES = new Set<string>(['__text']);

/*****************************************************************************/

function isExcludedProperty(
  name: string,
  node: LexicalNode,
  binding: Binding,
): boolean {
  if (
    BASE_EXCLUDED_PROPERTIES.has(name) ||
    typeof (node as unknown as Record<string, unknown>)[name] === 'function'
  ) {
    return true;
  }

  if ($isTextNode(node)) {
    if (TEXT_EXCLUDED_PROPERTIES.has(name)) {
      return true;
    }
  } else if ($isElementNode(node)) {
    if (
      ELEMENT_EXCLUDED_PROPERTIES.has(name) ||
      ($isRootNode(node) && ROOT_EXCLUDED_PROPERTIES.has(name))
    ) {
      return true;
    }
  }

  const nodeKlass = node.constructor;
  const excludedProperties = binding.excludedProperties.get(nodeKlass);
  return excludedProperties != null && excludedProperties.has(name);
}

function getSharedType(
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
    console.warn('getSharedType: Unsupported type for property access:', sharedType?.constructor?.name || typeof sharedType, property);
    return undefined;
  }
}

function setSharedType(
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  property: string,
  value: unknown,
): void {
  if (sharedType instanceof LoroMap) {
    sharedType.set(property, value);
  } else {
    sharedType.setAttribute(property, value as string);
  }
}

function syncNodeStateFromLexical(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  prevLexicalNode: null | LexicalNode,
  nextLexicalNode: LexicalNode,
): void {
  const nextState = nextLexicalNode.__state;
  const existingState = getSharedType(sharedType, '__state');
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
    setSharedType(sharedType, '__state', stateMap);
  }
}

/*****************************************************************************/

export function createLexicalNodeFromCollabNode(
  binding: Binding,
  collabNode: AnyCollabNode,
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
    collabNode.syncPropertiesAndTextFromCRDT(binding, null);
  } else if (collabNode instanceof CollabDecoratorNode) {
    collabNode.syncPropertiesFromCRDT(binding, null);
  }

  binding.collabNodeMap.set(lexicalNode.__key, collabNode);
  return lexicalNode;
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

export type NodeDetails = {
  nodeType: 'root' | 'element' | 'text' | 'decorator';
  nodeKey: NodeKey;
  type: string
  variant: 'attrs' | 'text';
}

/*
Parses ContainerID patterns and returns TargetDetails:

root
cid:root-root-root_attrs:Map     -> { nodeType: 'root', nodeKey: 'root', type: 'root', variant: 'attrs' }
cid:root-root-root:Text          -> { nodeType: 'root', nodeKey: 'root', type: 'root', variant: 'text' }

element  
cid:root-element_paragraph_1_attrs:Map -> { nodeType: 'element', nodeKey: '1', type: 'paragraph', variant: 'attrs' }
cid:root-element_paragraph_5_attrs:Map -> { nodeType: 'element', nodeKey: '5', type: 'paragraph', variant: 'attrs' }

text
cid:root-text_text_6:Map         -> { nodeType: 'text', nodeKey: '6', type: 'text', variant: 'text' }

decorator
cid:root-decorator_counter_3:Map -> { nodeType: 'decorator', nodeKey: '3', type: 'counter', variant: 'text' }
*/
export function getNodeTypeFromSharedType(
  containerId: ContainerID,
): [NodeDetails, NodeDetails?] | undefined {
  const containerIdStr = containerId.toString();

  // Remove 'cid:' prefix if present
  const cleanId = containerIdStr.startsWith('cid:') ? containerIdStr.slice(4) : containerIdStr;

  // Split by ':' first to separate the container type
  // Also handle possible parent node (split by '|')
  const [mainPart, ...restParts] = cleanId.split(':');
  // mainPart may contain '|', e.g. root-text_text_6|test_text_7
  const [idPart, parentPart] = mainPart.split('|');

  // Helper to parse a single id string (e.g. root-text_text_6)
  function parseId(id: string): NodeDetails | undefined {
    if (!id.startsWith('root-')) {
      return undefined;
    }
    const withoutRoot = id.slice(5);
    if (withoutRoot.startsWith('root-')) {
      const rootDetails = withoutRoot.slice(5); // Remove 'root-'
      return {
        nodeType: 'root',
        nodeKey: 'root',
        type: 'root',
        variant: rootDetails.includes('_attrs') ? 'attrs' : 'text',
      };
    }
    const parts = withoutRoot.split('_');
    if (parts.length < 2) {
      return undefined;
    }
    const nodeType = parts[0] as 'root' | 'element' | 'text' | 'decorator';
    if (nodeType === 'element' || nodeType === 'text' || nodeType === 'decorator') {
      if (parts.length >= 3) {
        const type = parts[1];
        const keyPart = parts[2];
        const hasAttrs = parts.length > 3 && parts[3] === 'attrs';
        return {
          nodeType,
          nodeKey: keyPart,
          type,
          variant: hasAttrs ? 'attrs' : 'text',
        };
      }
    }
    return undefined;
  }

  const nodeDetails = parseId(idPart);
  if (!nodeDetails) {
    return undefined;
  }

  let parentNodeDetails: NodeDetails | undefined = undefined;
  if (parentPart) {
    parentNodeDetails = parseId(parentPart);
  }

  return [nodeDetails, parentNodeDetails];
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
        let prevDoc: LoroDoc | undefined;

        if (prevValue instanceof EditorClass) {
          const prevKey = prevValue._key;
          prevDoc = docMap.get(prevKey);
          docMap.delete(prevKey);
        }

        // If we already have a document, use it, otherwise create new LoroDoc
        const doc = prevDoc || new LoroDoc();
        const key = doc.peerIdStr;
        nextValue._key = key;
        docMap.set(key, doc);
        nextValue = doc;
        // Mark the node dirty as we've assigned a new key to it
        binding.editor.update(() => {
          nextLexicalNode.markDirty();
        });
      }

      setSharedType(sharedType, property, nextValue);
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
  node: AnyCollabNode | null;
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
  fn();
  binding.doc.commit({ origin: binding.doc.peerIdStr });
}

/*****************************************************************************/

function $syncNodeStateToLexical(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  lexicalNode: LexicalNode,
): void {
  const existingState = getSharedType(sharedType, '__state');
  if (!(existingState instanceof LoroMap)) {
    return;
  }
  // This should only called when creating the node initially,
  // incremental updates to state come in through LoroMap events
  // with the __state as the target.
  $getWritableNodeState(lexicalNode).updateFromJSON(existingState.toJSON());
}

/*****************************************************************************/

export function $createCollabNodeFromLexicalNode(
  binding: Binding,
  lexicalNode: LexicalNode,
  parent: CollabElementNode,
): AnyCollabNode {
  const nodeType = lexicalNode.getType();
  let collabNode;

  if ($isElementNode(lexicalNode)) {
    const xmlText = new XmlText(binding.doc, `element_${nodeType}_${lexicalNode.getKey()}`);
    xmlText.setAttribute('__type', nodeType);
    collabNode = $createCollabElementNode(xmlText, parent, nodeType);
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
    collabNode.syncChildrenFromLexical(binding, lexicalNode, null, null, null);
  } else if ($isTextNode(lexicalNode)) {
    const map = binding.doc.getMap(`text_${nodeType}_${lexicalNode.getKey()}`);
    collabNode = $createCollabTextNode(
      map,
      lexicalNode.__text,
      parent,
      nodeType,
    );
    collabNode.syncPropertiesAndTextFromLexical(binding, lexicalNode, null);
  } else if ($isLineBreakNode(lexicalNode)) {
    const map = binding.doc.getMap(`linebreak_${nodeType}_${lexicalNode.getKey()}`);
    collabNode = $createCollabLineBreakNode(map, parent);
  } else if ($isDecoratorNode(lexicalNode)) {
    const map = binding.doc.getMap(`decorator_${nodeType}_${lexicalNode.getKey()}`);
    collabNode = $createCollabDecoratorNode(map, parent, nodeType);
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
  } else {
    invariant(false, 'Expected text, element, decorator, or linebreak node');
  }
  collabNode._key = lexicalNode.getKey();
  return collabNode;
}

export function $getOrInitCollabNodeFromSharedType(
  binding: Binding,
  containerId: ContainerID,
  parent?: CollabElementNode,
): AnyCollabNode {

  const doc = new LoroDoc();
  const tree = doc.getTree("tree");
  tree.getNodeByID("3@4")
  const root = tree.createNode();
  const child = root.createNode(0);
  child.id

  const [nodeDetails, parentNodeDetails] = getNodeTypeFromSharedType(containerId);
  invariant(nodeDetails !== undefined, 'Could not parse ContainerID: %s', containerId.toString());
  const collabNode = binding.collabNodeMap.get(nodeDetails.nodeKey);

  if (collabNode === undefined) {
    const registeredNodes = binding.editor._nodes;
    const nodeInfo = registeredNodes.get(nodeDetails.type);
    invariant(nodeInfo !== undefined, 'Node %s is not registered', nodeDetails.type);

    // Handle parent access - for XmlText (LoroText), parent is a function
    let sharedParent: any = null;
    if (sharedType instanceof XmlText) {
      // For LoroText-based XmlText, parent is a function
      sharedParent = (sharedType.parent as any)();
    } else {
      // For LoroMap, parent is a direct property
      sharedParent = sharedType.parent;
    }
    
    const targetParent =
      parent === undefined && sharedParent !== null
        ? $getOrInitCollabNodeFromSharedType(
            binding,
            sharedParent as any,
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

export function $syncPropertiesFromCRDT(
  binding: Binding,
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  lexicalNode: LexicalNode,
  keysChanged: null | Set<string>,
): void {
  const properties =
    keysChanged === null
      ? sharedType instanceof LoroMap
        ? Array.from(sharedType.keys())
        : Object.keys(sharedType.getAttributes())
      : Array.from(keysChanged);
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
    let nextValue = getSharedType(sharedType, property);

    // Special handling for embed properties
    if (property.startsWith('embed_') && nextValue && typeof nextValue === 'object') {
      const embedData = nextValue as any;
      
      if (embedData.object && embedData.object.id) {
        const objectId = embedData.object.id;

        // Check if this is a text node reference (Map containers ending with :Map)
        if (objectId.endsWith(':Map') && objectId.includes(':text_')) {
          try {
            const map = binding.doc.getMap(objectId);
            if (map && map.get('__type') === 'text') {
              // Get the CollabElementNode from the lexical node
              const collabElementNode = binding.collabNodeMap.get(lexicalNode.getKey());
              if (collabElementNode && 'append' in collabElementNode) {
                // Create CollabTextNode
                const collabTextNode = $createCollabTextNode(map, '', collabElementNode as any, 'text');
                
                // Add to CollabElementNode children if not already present
                const children = (collabElementNode as any)._children;
                if (children && !children.includes(collabTextNode)) {
                  children.push(collabTextNode);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ [SYNC-PROPS] Error creating CollabTextNode from embed:', error);
          }
        }
      }
    }

    if (prevValue !== nextValue) {
      if (nextValue instanceof LoroDoc) {
        const docMap = binding.docMap;

        if (prevValue instanceof LoroDoc) {
          // TODO: Handle document cleanup
        }

        const nestedEditor = createEditor();
        const key = nextValue.peerIdStr;
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
