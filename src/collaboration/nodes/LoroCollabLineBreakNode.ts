/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LineBreakNode, NodeKey, NodeMap } from 'lexical';
import type { LoroCollabNode } from './LoroCollabNode';
import { $getNodeByKey, $isLineBreakNode } from 'lexical';

export class LoroCollabLineBreakNode implements LoroCollabNode {
  _key: NodeKey;
  _parent: any; // LoroCollabElementNode
  _type: string;

  constructor(parent: any) {
    this._key = '';
    this._parent = parent;
    this._type = 'linebreak';
  }

  getPrevNode(nodeMap: NodeMap | null): LineBreakNode | null {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isLineBreakNode(node) ? node : null;
  }

  getNode(): LineBreakNode | null {
    const node = $getNodeByKey(this._key);
    return $isLineBreakNode(node) ? node : null;
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
