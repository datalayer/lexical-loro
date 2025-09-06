/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { ElementNode, NodeKey, NodeMap } from 'lexical';
import type { LoroTree, TreeID } from 'loro-crdt';
import type { LoroBinding } from '../LoroBinding';
import type { LoroCollabNode } from './LoroCollabNode';

import {
  $getNodeByKey,
  $isElementNode,
  $isTextNode,
  $isDecoratorNode,
} from 'lexical';

/**
 * LoroCollabElementNode - Equivalent to YJS CollabElementNode
 * 
 * This class represents an element node in the collaboration layer,
 * bridging between Lexical ElementNode and Loro Tree structure.
 * 
 * YJS uses XmlText for hierarchical structure, Loro uses Tree.
 */
export class LoroCollabElementNode implements LoroCollabNode {
  _key: NodeKey;
  _children: Array<LoroCollabNode>;
  _loroTree: LoroTree;
  _treeId: TreeID;
  _type: string;
  _parent: LoroCollabElementNode | null;

  constructor(
    loroTree: LoroTree,
    parent: LoroCollabElementNode | null,
    type: string,
    containerId: string = 'document'
  ) {
    this._key = '';
    this._children = [];
    this._loroTree = loroTree;
    this._type = type;
    this._parent = parent;
    
    // For now, use a simple string-based ID until we understand the correct Loro Tree API
    this._treeId = (containerId + '_' + type + '_' + Date.now()) as TreeID;
    
    console.log('🌳 Created LoroCollabElementNode:', {
      type,
      treeId: this._treeId,
      containerId,
      hasParent: !!parent
    });
  }

  getNode(): ElementNode | null {
    const node = $getNodeByKey(this._key);
    return $isElementNode(node) ? node : null;
  }

  getPrevNode(nodeMap: NodeMap | null): ElementNode | null {
    if (nodeMap === null) {
      return null;
    }
    const node = nodeMap.get(this._key);
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

  setKey(key: NodeKey): void {
    this._key = key;
    // TODO: Update Loro tree metadata when API is confirmed
  }

  isEmpty(): boolean {
    return this._children.length === 0;
  }

  getSize(): number {
    return 1; // Element nodes count as 1
  }

  getOffset(): number {
    if (!this._parent) {
      return 0;
    }
    
    // Find this node's position in parent's children
    const siblings = this._parent._children;
    return siblings.indexOf(this);
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

  getChildrenSize(): number {
    return this._children.length;
  }

  getFirstChild(): LoroCollabNode | null {
    return this._children[0] || null;
  }

  getLastChild(): LoroCollabNode | null {
    return this._children[this._children.length - 1] || null;
  }

  /**
   * Sync properties from Lexical to Loro (equivalent to YJS syncPropertiesFromLexical)
   */
  syncPropertiesFromLexical(
    _binding: LoroBinding, // eslint-disable-line @typescript-eslint/no-unused-vars
    lexicalNode: ElementNode,
    _prevNodeMap: NodeMap | null // eslint-disable-line @typescript-eslint/no-unused-vars
  ): void {
    console.log('🔄 Syncing element properties from Lexical to Loro:', {
      nodeType: lexicalNode.getType(),
      nodeKey: lexicalNode.getKey()
    });

    // TODO: Update Loro tree metadata with Lexical node properties
    // This requires understanding the correct Loro Tree metadata API
  }

  /**
   * Sync properties from Loro to Lexical (equivalent to YJS syncPropertiesFromYjs)
   */
  syncPropertiesFromLoro(_binding: LoroBinding, changedKeys: Set<string>): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.log('🔄 Syncing element properties from Loro to Lexical:', {
      changedKeys: Array.from(changedKeys)
    });

    const lexicalNode = this.getNode();
    if (!lexicalNode) {
      console.warn('⚠️ No Lexical node found for collab element');
      return;
    }

    // TODO: Apply property changes from Loro metadata to Lexical node
    // This requires the correct Loro Tree metadata API
  }

  /**
   * Sync children from Lexical to Loro (equivalent to YJS syncChildrenFromLexical)
   */
  syncChildrenFromLexical(
    _binding: LoroBinding, // eslint-disable-line @typescript-eslint/no-unused-vars
    lexicalNode: ElementNode,
    _prevNodeMap: NodeMap | null, // eslint-disable-line @typescript-eslint/no-unused-vars
    _dirtyElements: Map<NodeKey, boolean>, // eslint-disable-line @typescript-eslint/no-unused-vars
    _dirtyLeaves: Set<NodeKey> // eslint-disable-line @typescript-eslint/no-unused-vars
  ): void {
    console.log('🔄 Syncing children from Lexical to Loro:', {
      nodeKey: lexicalNode.getKey(),
      childrenCount: lexicalNode.getChildrenSize()
    });

    // TODO: Implement children synchronization
    const children = lexicalNode.getChildren();
    
    // For now, just log the children structure
    children.forEach((child, index) => {
      console.log(`  Child ${index}:`, {
        type: child.getType(),
        key: child.getKey(),
        isText: $isTextNode(child),
        isElement: $isElementNode(child),
        isDecorator: $isDecoratorNode(child)
      });
    });
  }

  /**
   * Sync children from Loro to Lexical (equivalent to YJS syncChildrenFromYjs)
   */
  syncChildrenFromLoro(_binding: LoroBinding): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.log('🔄 Syncing children from Loro to Lexical');
    // TODO: Implement children synchronization from Loro tree to Lexical
  }

  /**
   * Apply Loro tree delta to children (equivalent to YJS applyChildrenYjsDelta)
   */
  applyChildrenLoroDelta(_binding: LoroBinding, delta: any[]): void { // eslint-disable-line @typescript-eslint/no-unused-vars
    console.log('🔄 Applying Loro tree delta to children:', delta);
    // TODO: Implement delta application
  }

  /**
   * Apply delta operations from Loro to update the Lexical editor state
   * @deprecated Use applyChildrenLoroDelta instead
   */
  applyLoroDeltas(_binding: any, deltas: Array<any>): void {
    console.log('� Applying Loro deltas (deprecated):', deltas);
  }

  /**
   * Create collaboration node from Lexical node (equivalent to YJS $createCollabNodeFromLexicalNode)
   */
  static createFromLexicalNode(
    binding: LoroBinding,
    lexicalNode: ElementNode,
    parent: LoroCollabElementNode | null
  ): LoroCollabElementNode {
    const collabNode = new LoroCollabElementNode(
      binding.rootTree,
      parent,
      lexicalNode.getType()
    );
    
    collabNode.setKey(lexicalNode.getKey());
    collabNode.syncPropertiesFromLexical(binding, lexicalNode, null);
    
    // Register in binding's collaboration node map
    binding.collabNodeMap.set(lexicalNode.getKey(), collabNode);
    
    return collabNode;
  }
}
