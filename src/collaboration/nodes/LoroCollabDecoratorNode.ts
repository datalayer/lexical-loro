/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { DecoratorNode, NodeKey, NodeMap } from 'lexical';
import type { LoroCollabNode } from './LoroCollabNode';
import { $getNodeByKey, $isDecoratorNode } from 'lexical';

export class LoroCollabDecoratorNode implements LoroCollabNode {
  _key: NodeKey;
  _parent: any; // LoroCollabElementNode
  _type: string;

  constructor(parent: any, type: string) {
    this._key = '';
    this._parent = parent;
    this._type = type;
  }

  getPrevNode(nodeMap: NodeMap | null): DecoratorNode<any> | null {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isDecoratorNode(node) ? node : null;
  }

  getNode(): DecoratorNode<any> | null {
    const node = $getNodeByKey(this._key);
    return $isDecoratorNode(node) ? node : null;
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
    if (this._parent && this._parent.getChildOffset) {
      return this._parent.getChildOffset(this);
    }
    return 0;
  }
}
