/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding, LoroNode} from '.';
import type {LoroDoc} from 'loro-crdt';

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
import invariant from './shared/invariant';

// Note: LoroMap and LoroText will be imported as concrete classes when loro-crdt is available
import {
  $createCollabDecoratorNode,
  CollabDecoratorNode,
} from './CollabDecoratorNode';
import {$createCollabElementNode, CollabElementNode} from './CollabElementNode';
import {
  $createCollabLineBreakNode,
  CollabLineBreakNode,
} from './CollabLineBreakNode';
import {$createCollabTextNode, CollabTextNode} from './CollabTextNode';

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

export function spliceString(
  str: string,
  index: number,
  delCount: number,
  newText: string,
): string {
  return str.slice(0, index) + newText + str.slice(index + delCount);
}

export function getPositionFromElementAndOffset(
  collabElementNode: CollabElementNode,
  offset: number,
  boundaryMeaning: boolean,
): {
  length: number;
  node: CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode;
  nodeIndex: number;
} {
  const children = collabElementNode._children;
  let currentOffset = 0;
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childSize = child.getSize();
    
    if (currentOffset + childSize > offset || 
        (boundaryMeaning && currentOffset + childSize === offset)) {
      return {
        length: offset - currentOffset,
        node: child,
        nodeIndex: i,
      };
    }
    
    currentOffset += childSize;
  }
  
  // If we reach here, offset is at the end
  return {
    length: 0,
    node: collabElementNode,
    nodeIndex: children.length,
  };
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
    const loroText = binding.doc.getText(`element_${lexicalNode.__key}`);
    collabNode = $createCollabElementNode(loroText, parent, nodeType);
    collabNode.syncPropertiesAndTextFromLexical(binding, lexicalNode, null);
  } else if ($isTextNode(lexicalNode)) {
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
  sharedType: any, // Using any for now since LoroMap/LoroText types aren't available
): string | undefined {
  if (sharedType && typeof sharedType.get === 'function') {
    const type = sharedType.get('__type');
    invariant(
      typeof type === 'string' || typeof type === 'undefined',
      'Expected shared type to include type attribute',
    );
    return type as string;
  }
  // For LoroText, we might need to store type information differently
  return undefined;
}

export function $getOrInitCollabNodeFromSharedType(
  binding: Binding,
  sharedType: any, // Using any for now since LoroMap/LoroText types aren't available
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

    const targetParent = parent || null;

    invariant(
      targetParent instanceof CollabElementNode,
      'Expected parent to be a collab element node',
    );

    if (sharedType && typeof sharedType.insert === 'function') {
      // This is likely a LoroText
      return $createCollabElementNode(sharedType, targetParent, type);
    } else if (sharedType && typeof sharedType.get === 'function') {
      // This is likely a LoroMap
      if (type === 'linebreak') {
        return $createCollabLineBreakNode(sharedType, targetParent);
      }
      return $createCollabTextNode(sharedType, '', targetParent, type);
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
    const loroText = collabNode._loroText;
    collabNode.syncPropertiesFromLoro(binding, null);
  } else if (collabNode instanceof CollabTextNode) {
    collabNode.syncPropertiesAndTextFromLoro(binding, null);
  } else if (collabNode instanceof CollabDecoratorNode) {
    collabNode.syncPropertiesFromLoro(binding, null);
  }

  binding.collabNodeMap.set(lexicalNode.__key, collabNode);
  return lexicalNode;
}

export function $syncPropertiesFromLoro(
  binding: Binding,
  sharedType: any, // Using any for now since LoroMap type isn't available
  lexicalNode: LexicalNode,
  keysChanged: null | Set<string>,
): void {
  const properties =
    keysChanged === null
      ? Array.from(sharedType.keys())
      : Array.from(keysChanged);
  let writableNode: LexicalNode | undefined;

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i] as string;
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
    const prevValue = (lexicalNode as any)[property as keyof LexicalNode];
    let nextValue = sharedType.get(property);

    if (prevValue !== nextValue) {
      if (nextValue && typeof nextValue === 'object' && nextValue.getPeerID) {
        // This might be a LoroDoc
        const loroDocMap = binding.docMap;

        if (prevValue && typeof prevValue === 'object' && prevValue.getPeerID) {
          loroDocMap.delete(prevValue.getPeerID());
        }

        const nestedEditor = createEditor();
        const key = nextValue.getPeerID();
        nestedEditor._key = key;
        loroDocMap.set(key, nextValue);

        nextValue = nestedEditor;
      }

      if (writableNode === undefined) {
        writableNode = lexicalNode.getWritable();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (writableNode as any)[property as keyof LexicalNode] = nextValue;
    }
  }
}

function $syncNodeStateToLexical(
  binding: Binding,
  sharedType: any, // LoroMap type not available yet
  lexicalNode: LexicalNode,
): void {
  const existingState = sharedType.get('__state');
  if (!(existingState && typeof existingState === 'object' && existingState.toJSON)) {
    return;
  }
  // This should only called when creating the node initially,
  // incremental updates to state come through LoroMap events
  // with the __state as the target.
  $getWritableNodeState(lexicalNode).updateFromJSON(existingState.toJSON());
}

function syncNodeStateFromLexical(
  binding: Binding,
  sharedType: any, // LoroMap type not available yet
  prevLexicalNode: null | LexicalNode,
  nextLexicalNode: LexicalNode,
): void {
  const nextState = nextLexicalNode.__state;
  const existingState = sharedType.get('__state');
  if (!nextState) {
    return;
  }
  const [unknown, known] = nextState.getInternalState();
  const prevState = prevLexicalNode && prevLexicalNode.__state;
  const stateMap: any =
    existingState && typeof existingState === 'object' ? existingState : binding.doc.getMap('__state');
  if (prevState === nextState) {
    return;
  }
  const [prevUnknown, prevKnown] =
    prevState
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
    sharedType.set('__state', stateMap);
  }
}

export function syncPropertiesFromLexical(
  binding: Binding,
  sharedType: any, // LoroMap type not available yet
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

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevValue = prevLexicalNode ? (prevLexicalNode as any)[property] : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nextValue = (nextLexicalNode as any)[property];

    if (prevValue !== nextValue) {
      if (nextValue === undefined) {
        sharedType.delete(property);
      } else {
        sharedType.set(property, nextValue);
      }
    }
  }

  syncNodeStateFromLexical(binding, sharedType, prevLexicalNode, nextLexicalNode);
}

export function syncWithTransaction(binding: Binding, fn: () => void): void {
  // Note: loro-crdt 1.5.10 handles transactions automatically
  // No explicit transact() call needed
  fn();
}

export function doesSelectionNeedRecovering(selection: null | RangeSelection): boolean {
  return selection !== null && selection.isCollapsed() && selection.anchor.key === 'root';
}

export function $moveSelectionToPreviousNode(
  anchorNode: LexicalNode,
  isBackward: boolean,
): void {
  if (isBackward) {
    anchorNode.selectPrevious();
  } else {
    anchorNode.selectNext();
  }
}
