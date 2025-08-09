/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding, LoroText} from '.';
import type {ElementNode, NodeKey, NodeMap} from 'lexical';

import {
  $getNodeByKey,
  $isElementNode,
} from 'lexical';
import invariant from './shared/invariant';

import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabTextNode} from './CollabTextNode';

type IntentionallyMarkedAsDirtyElement = boolean;

export class CollabElementNode {
  _key: NodeKey;
  _children: Array<
    | CollabElementNode
    | CollabTextNode
    | CollabDecoratorNode
    | CollabLineBreakNode
  >;
  _loroText: LoroText;
  _type: string;
  _parent: null | CollabElementNode;

  constructor(
    loroText: LoroText,
    parent: null | CollabElementNode,
    type: string,
  ) {
    this._key = '';
    this._children = [];
    this._loroText = loroText;
    this._type = type;
    this._parent = parent;
  }

  getPrevNode(nodeMap: null | NodeMap): null | ElementNode {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isElementNode(node) ? node : null;
  }

  getNode(): null | ElementNode {
    const node = $getNodeByKey(this._key);
    return $isElementNode(node) ? node : null;
  }

  getSharedType(): LoroText {
    return this._loroText;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  isEmpty(): boolean {
    return this._children.length === 0;
  }

  getSize(): number {
    return 1;
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    invariant(
      collabElementNode !== null,
      'getOffset: collab element node parent is null',
    );
    return collabElementNode.getChildOffset(this);
  }

  syncPropertiesFromLoro(
    binding: Binding,
    keysChanged: null | Set<string>,
  ): void {
    const node = this.getNode();
    
    if (node === null) {
      return;
    }

    // TODO: Implement property synchronization from Loro
    // For now, skip property sync until we implement proper
    // Loro container structure for storing node properties
  }

  syncPropertiesAndTextFromLexical(
    binding: Binding,
    lexicalNode: ElementNode,
    prevNodeMap: null | NodeMap,
  ): IntentionallyMarkedAsDirtyElement {
    const prevNode = this.getPrevNode(prevNodeMap);
    let isDirty = false;

    if (prevNode !== null && lexicalNode !== prevNode) {
      isDirty = true;
    }

    // TODO: Implement property synchronization to Loro
    // For now, skip property sync until we implement proper
    // Loro container structure for storing node properties

    return isDirty;
  }

  append(
    collabNode:
      | CollabElementNode
      | CollabTextNode
      | CollabDecoratorNode
      | CollabLineBreakNode,
  ): void {
    const children = this._children;
    // Removed unused index variable
    children.push(collabNode);
    collabNode._parent = this;

    const loroText = this._loroText;
    const offset = loroText.length;

    if (collabNode instanceof CollabElementNode) {
      // TODO: Insert the element node's text - need to implement proper nesting
      // For now, insert a placeholder marker
      loroText.insert(offset, `[ELEMENT:${collabNode._key}]`);
    } else if (collabNode instanceof CollabTextNode) {
      // Insert text content
      loroText.insert(offset, collabNode._text);
    } else if (collabNode instanceof CollabLineBreakNode) {
      // Insert line break marker
      loroText.insert(offset, '\n');
    } else if (collabNode instanceof CollabDecoratorNode) {
      // Insert decorator placeholder
      loroText.insert(offset, `[DECORATOR:${collabNode._key}]`);
    }
  }

  splice(
    binding: Binding,
    index: number,
    delCount: number,
    collabNode?:
      | CollabElementNode
      | CollabTextNode
      | CollabDecoratorNode
      | CollabLineBreakNode,
  ): void {
    const children = this._children;
    const child = children[index];

    if (child === undefined) {
      invariant(
        collabNode !== undefined,
        'splice: could not find collab element node',
      );
      this.append(collabNode);
      return;
    }

    const offset = child.getOffset();
    invariant(offset !== -1, 'splice: expected offset to be greater than zero');

    const loroText = this._loroText;

    if (delCount !== 0) {
      loroText.delete(offset, child.getSize());
    }

    if (collabNode instanceof CollabElementNode) {
      // TODO: Insert the element node's text - need to implement proper nesting
      // For now, insert a placeholder marker
      loroText.insert(offset, `[ELEMENT:${collabNode._key}]`);
    } else if (collabNode instanceof CollabTextNode) {
      loroText.insert(offset, collabNode._text);
    } else if (collabNode instanceof CollabLineBreakNode) {
      loroText.insert(offset, '\n');
    } else if (collabNode instanceof CollabDecoratorNode) {
      loroText.insert(offset, '[DECORATOR]');
    }

    if (delCount !== 0) {
      const childrenToDelete = children.slice(index, index + delCount);

      for (let i = 0; i < childrenToDelete.length; i++) {
        childrenToDelete[i].destroy(binding);
      }
    }

    if (collabNode !== undefined) {
      children.splice(index, delCount, collabNode);
    } else {
      children.splice(index, delCount);
    }
  }

  getChildOffset(
    collabNode:
      | CollabElementNode
      | CollabTextNode
      | CollabDecoratorNode
      | CollabLineBreakNode,
  ): number {
    let offset = 0;
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child === collabNode) {
        return offset;
      }

      offset += child.getSize();
    }

    return -1;
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    const children = this._children;

    for (let i = 0; i < children.length; i++) {
      children[i].destroy(binding);
    }

    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabElementNode(
  loroText: LoroText,
  parent: null | CollabElementNode,
  type: string,
): CollabElementNode {
  const collabNode = new CollabElementNode(loroText, parent, type);
  // Store reference for later access
  // Store reference to collaboration node
  const loroTextWithCollab = loroText as LoroText & {_collabNode?: CollabElementNode};
  loroTextWithCollab._collabNode = collabNode;
  return collabNode;
}
