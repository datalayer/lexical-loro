/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { ElementNode, NodeKey, NodeMap } from 'lexical';
import type { LoroTree, TreeID } from 'loro-crdt';
import type { LoroCollabNode } from './LoroCollabNode';
import { $getNodeByKey, $isElementNode } from 'lexical';

export class LoroCollabElementNode implements LoroCollabNode {
  _key: NodeKey;
  _children: Array<LoroCollabNode>;
  _loroTree: LoroTree; // Use Tree for hierarchical structure (equivalent to YJS XmlText)
  _treeId: TreeID;
  _type: string;
  _parent: LoroCollabElementNode | null;

  constructor(
    loroTree: LoroTree,
    parent: LoroCollabElementNode | null,
    type: string,
    treeId?: string,
  ) {
    this._key = '';
    this._children = [];
    this._loroTree = loroTree;
    this._treeId = (treeId || 'document') as TreeID;
    this._type = type;
    this._parent = parent;
  }

  getPrevNode(nodeMap: NodeMap | null): ElementNode | null {
    if (nodeMap === null) {
      return null;
    }

    const node = nodeMap.get(this._key);
    return $isElementNode(node) ? node : null;
  }

  getNode(): ElementNode | null {
    const node = $getNodeByKey(this._key);
    return $isElementNode(node) ? node : null;
  }

  getLoroTree(): LoroTree {
    return this._loroTree;
  }

  getTreeId(): TreeID {
    return this._treeId;
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
    if (collabElementNode === null) {
      return 0;
    }

    return collabElementNode.getChildOffset(this);
  }

  getChildOffset(collabNode: LoroCollabNode): number {
    const children = this._children;
    let offset = 0;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child === collabNode) {
        return offset;
      }
      offset += child.getSize();
    }

    return -1;
  }

  /**
   * Apply delta operations from Loro to update the Lexical editor state
   */
  applyLoroDeltas(_binding: any, deltas: Array<any>): void {
    // TODO: Implement delta application logic similar to YJS
    // This will process insertions, deletions, and retains from Loro
    console.log('📝 Applying Loro deltas:', deltas);
  }

  /**
   * Sync children from Loro tree to Lexical nodes
   */
  syncChildrenFromLoro(_binding: any): void {
    // TODO: Implement children synchronization logic
    // This will ensure Lexical nodes match the Loro tree structure
    console.log('🔄 Syncing children from Loro tree');
  }

  /**
   * Sync properties from Loro to Lexical node
   */
  syncPropertiesFromLoro(_binding: any, keysChanged: Set<string> | null): void {
    // TODO: Implement property synchronization
    // This will update node properties based on Loro changes
    console.log('🔧 Syncing properties from Loro:', keysChanged);
  }
}
