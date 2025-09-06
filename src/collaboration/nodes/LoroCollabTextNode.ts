/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { TextNode, NodeKey, NodeMap } from 'lexical';
import type { LoroCollabNode } from './LoroCollabNode';
import { $getNodeByKey, $isTextNode } from 'lexical';

export class LoroCollabTextNode implements LoroCollabNode {
  _key: NodeKey;
  _text: string;
  _parent: any; // LoroCollabElementNode
  _type: string;

  constructor(text: string, parent: any) {
    this._key = '';
    this._text = text;
    this._parent = parent;
    this._type = 'text';
  }

  getPrevNode(nodeMap: NodeMap | null): TextNode | null {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isTextNode(node) ? node : null;
  }

  getNode(): TextNode | null {
    const node = $getNodeByKey(this._key);
    return $isTextNode(node) ? node : null;
  }

  getType(): string {
    return this._type;
  }

  getKey(): NodeKey {
    return this._key;
  }

  getSize(): number {
    return this._text.length;
  }

  getOffset(): number {
    if (this._parent && this._parent.getChildOffset) {
      return this._parent.getChildOffset(this);
    }
    return 0;
  }
}
