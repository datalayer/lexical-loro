/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type {XmlElement} from 'yjs';
import type {DecoratorNode, NodeKey, NodeMap} from 'lexical';
import {$getNodeByKey, $isDecoratorNode} from 'lexical';
import invariant from '../../utils/invariant';
import {$syncPropertiesFromYjs, syncPropertiesFromLexical} from '../utils/Utils';
import type {Binding} from '../Bindings';
import type {CollabElementNode} from './CollabElementNode';

export class CollabDecoratorNode {
  _xmlElem: XmlElement;
  _key: NodeKey;
  _parent: CollabElementNode;
  _type: string;

  constructor(xmlElem: XmlElement, parent: CollabElementNode, type: string) {
    this._key = '';
    this._xmlElem = xmlElem;
    this._parent = parent;
    this._type = type;
  }

  getPrevNode(nodeMap: null | NodeMap): null | DecoratorNode<unknown> {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getNode(): null | DecoratorNode<unknown> {
    const node = $getNodeByKey(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getSharedType(): XmlElement {
    return this._xmlElem;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getSize(): number {
    return 1;
  }

  getOffset(): number {
    const collabElementNode = this._parent;
    return collabElementNode.getChildOffset(this);
  }

  syncPropertiesFromLexical(
    binding: Binding,
    nextLexicalNode: DecoratorNode<unknown>,
    prevNodeMap: null | NodeMap,
  ): void {
    const prevLexicalNode = this.getPrevNode(prevNodeMap);
    const xmlElem = this._xmlElem;

    syncPropertiesFromLexical(
      binding,
      xmlElem,
      prevLexicalNode,
      nextLexicalNode,
    );
  }

  syncPropertiesFromYjs(
    binding: Binding,
    keysChanged: null | Set<string>,
  ): void {
    const lexicalNode = this.getNode();
    invariant(
      lexicalNode !== null,
      'syncPropertiesFromYjs: could not find decorator node',
    );
    const xmlElem = this._xmlElem;
    $syncPropertiesFromYjs(binding, xmlElem, lexicalNode, keysChanged);
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabDecoratorNode(
  xmlElem: XmlElement,
  parent: CollabElementNode,
  type: string,
): CollabDecoratorNode {
  const collabNode = new CollabDecoratorNode(xmlElem, parent, type);
  (xmlElem as any)._collabNode = collabNode;
  return collabNode;
}
