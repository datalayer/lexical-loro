/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding} from '.';
import type {CollabElementNode} from './CollabElementNode';
import type {DecoratorNode, NodeKey, NodeMap} from 'lexical';
import type {LoroMap} from 'loro-crdt';

import {$getNodeByKey, $isDecoratorNode} from 'lexical';
import invariant from '../utils/invariant';

import {$syncPropertiesFromYjs, syncPropertiesFromLexical} from './Utils';

export class CollabDecoratorNode {
  _map: LoroMap<Record<string, unknown>>;
  _key: NodeKey;
  _parent: CollabElementNode;
  _type: string;

  constructor(map: LoroMap<Record<string, unknown>>, parent: CollabElementNode, type: string) {
    this._key = '';
    this._map = map;
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

  getSharedType(): LoroMap<Record<string, unknown>> {
    return this._map;
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
    const map = this._map;

    syncPropertiesFromLexical(
      binding,
      map,
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
    const map = this._map;
    $syncPropertiesFromYjs(binding, map, lexicalNode, keysChanged);
  }

  destroy(binding: Binding): void {
    const collabNodeMap = binding.collabNodeMap;
    if (collabNodeMap.get(this._key) === this) {
      collabNodeMap.delete(this._key);
    }
  }
}

export function $createCollabDecoratorNode(
  map: LoroMap<Record<string, unknown>>,
  parent: CollabElementNode,
  type: string,
): CollabDecoratorNode {
  const collabNode = new CollabDecoratorNode(map, parent, type);
  (map as any)._collabNode = collabNode;
  return collabNode;
}
