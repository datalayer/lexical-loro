/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding, CRDTNode} from './state/State';

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
import invariant from '../utils/invariant';
import {LoroMap, LoroDoc} from 'loro-crdt';
import {XmlText} from './types/XmlText';

import {
  $createCollabDecoratorNode,
  CollabDecoratorNode,
} from './nodes/CollabDecoratorNode';
import {$createCollabElementNode, CollabElementNode} from './nodes/CollabElementNode';
import {
  $createCollabLineBreakNode,
  CollabLineBreakNode,
} from './nodes/CollabLineBreakNode';
import {$createCollabTextNode, CollabTextNode} from './nodes/CollabTextNode';

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

  if ($isElementNode(lexicalNode)) {
    const xmlText = new XmlText(binding.doc, `element_${lexicalNode.__key}`);
    collabNode = $createCollabElementNode(xmlText, parent, nodeType);
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
    collabNode.syncChildrenFromLexical(binding, lexicalNode, null, null, null);
  } else if ($isTextNode(lexicalNode)) {
    // TODO create a token text node for token, segmented nodes.
    const map = binding.doc.getMap(`text_${lexicalNode.__key}`);
    collabNode = $createCollabTextNode(
      map,
      lexicalNode.__text,
      parent,
      nodeType,
    );
    collabNode.syncPropertiesAndTextFromLexical(binding, lexicalNode, null);
  } else if ($isLineBreakNode(lexicalNode)) {
    const map = binding.doc.getMap(`linebreak_${lexicalNode.__key}`);
    map.set('__type', 'linebreak');
    collabNode = $createCollabLineBreakNode(map, parent);
  } else if ($isDecoratorNode(lexicalNode)) {
    const map = binding.doc.getMap(`decorator_${lexicalNode.__key}`);
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
      // For decorator nodes, we use LoroMap as well
      return $createCollabDecoratorNode(sharedType as LoroMap<Record<string, unknown>>, targetParent, type);
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
    collabNode.syncPropertiesAndTextFromCRDT(binding, null);
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
    let nextValue = sharedTypeGet(sharedType, property);

    if (prevValue !== nextValue) {
      if (nextValue instanceof LoroDoc) {
        const loroDocMap = binding.docMap;

        if (prevValue instanceof LoroDoc) {
          // TODO: Handle document cleanup
        }

        const nestedEditor = createEditor();
        const key = nextValue.peerId.toString();
        nestedEditor._key = key;
        loroDocMap.set(key, nextValue);

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
  sharedType: XmlText | LoroMap<Record<string, unknown>>,
  property: string,
): unknown {
  if (sharedType instanceof LoroMap) {
    return sharedType.get(property);
  } else {
    return sharedType.getAttribute(property);
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
        const loroDocMap = binding.docMap;
        let prevDoc;

        if (prevValue instanceof EditorClass) {
          const prevKey = prevValue._key;
          prevDoc = loroDocMap.get(prevKey);
          loroDocMap.delete(prevKey);
        }

        // If we already have a document, use it, otherwise create new LoroDoc
        const doc = prevDoc || new LoroDoc();
        const key = doc.peerId.toString();
        nextValue._key = key;
        loroDocMap.set(key, doc);
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
  // TODO: Implement Loro transaction wrapping
  // Loro handles transactions differently than YJS
  fn();
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
