/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { LoroTree, LoroTreeNode, TreeID } from 'loro-crdt';
import { LexicalNode, NodeKey, EditorState } from 'lexical';
import { Binding } from '../Bindings';
import { LexicalNodeData } from '../types/LexicalNodeData';
import { invariant } from '../utils/Invariant';
import { isLiveTreeNode, setNodeData } from '../utils/Utils';

/**
 * Bidirectional mapping between Lexical NodeKeys and Loro TreeIDs
 */
export class NodeMapper {
  // Maps Lexical NodeKey to Loro TreeID
  private lexicalToLoro = new Map<NodeKey, TreeID>();
  
  // Maps Loro TreeID to Lexical NodeKey
  private loroToLexical = new Map<TreeID, NodeKey>();
  
  private tree: LoroTree;

  constructor(binding: Binding) {
    this.tree = binding.tree;
  }

  /**
   * Create a bidirectional mapping between Lexical NodeKey and Loro TreeID
   */
  private createMapping(nodeKey: NodeKey, treeId: TreeID): void {
    this.lexicalToLoro.set(nodeKey, treeId);
    this.loroToLexical.set(treeId, nodeKey);
  }

  /**
   * Remove bidirectional mapping
   */
  private removeMapping(nodeKey: NodeKey, treeId: TreeID): void {
    this.lexicalToLoro.delete(nodeKey);
    this.loroToLexical.delete(treeId);
  }

  /**
   * Get Loro TreeNode based on Lexical NodeKey
   * If the node doesn't exist, create it with proper parent-child relationship
   */
  getLoroNodeByLexicalKey(
    nodeKey: NodeKey, 
    lexicalNode?: LexicalNode,
    parentTreeID?: TreeID,
    index?: number
  ): LoroTreeNode {
    // Check if mapping already exists
    const existingTreeID = this.lexicalToLoro.get(nodeKey);
    if (existingTreeID && isLiveTreeNode(this.tree, existingTreeID)) {
      return this.tree.getNodeByID(existingTreeID)!;
    }

    // The document has one root, and every peer has to agree on which Loro
    // node that is. A Lexical root with no mapping adopts the root the tree
    // already holds — put there by the server's seed, or by the peer that got
    // there first — and mints one only when the tree has none. Minting a
    // second root is what happened when a pane propagated its initial state
    // before the snapshot arrived: this mapper holds one Loro root per
    // Lexical key, so nothing created under the extra one could ever be
    // placed by the other peer.
    if (nodeKey === 'root') {
      const adoptedRoot = this.tree.roots()[0];
      if (adoptedRoot) {
        this.createMapping(nodeKey, adoptedRoot.id);
        return adoptedRoot;
      }
      const rootTreeID = this.createLoroNode(nodeKey, lexicalNode, undefined, 0);
      const rootTreeNode = this.tree.getNodeByID(rootTreeID)!;
      setNodeData(rootTreeNode, 'elementType', 'root');
      return rootTreeNode;
    }

    // Get parent TreeID from Lexical node if not provided
    if (!parentTreeID && lexicalNode) {
      const lexicalParent = lexicalNode.getParent();
      if (lexicalParent) {
        const parentKey = lexicalParent.getKey();
        parentTreeID = this.lexicalToLoro.get(parentKey);
        
        // If parent doesn't exist in Loro, create it first
        if (!parentTreeID) {
          const parentLoroNode = this.getLoroNodeByLexicalKey(
            parentKey,
            lexicalParent,
            undefined,
            undefined
          );
          parentTreeID = parentLoroNode.id;
        }
      }
    }

    // Get index from Lexical node if not provided
    if (index === undefined && lexicalNode) {
      index = lexicalNode.getIndexWithinParent();
    }

    // Create new tree node if it doesn't exist
    const newTreeID = this.createLoroNode(nodeKey, lexicalNode, parentTreeID, index);
    return this.tree.getNodeByID(newTreeID)!;
  }

  /**
   * Get Lexical NodeKey based on Loro TreeID
   * If the node doesn't exist in Lexical, it needs to be created externally
   */
  getLexicalKeyByLoroId(treeId: TreeID): NodeKey | null {
    // Check if mapping exists
    const existingNodeKey = this.loroToLexical.get(treeId);
    if (existingNodeKey) {
      return existingNodeKey;
    }

    // If no mapping exists, we can't create a Lexical node here
    // The caller should integrate Lexical node creation
    return null;
  }

  /**
   * Get Lexical Node from EditorState based on Loro TreeID
   */
  getLexicalNodeByLoroId(treeId: TreeID, editorState: EditorState): LexicalNode | null {
    const nodeKey = this.getLexicalKeyByLoroId(treeId);
    if (!nodeKey) {
      return null;
    }

    return editorState._nodeMap.get(nodeKey) || null;
  }

  /**
   * Get Lexical parent node key for a Loro TreeID
   * Returns null if no parent or if parent not found in Lexical
   * Note: This method needs the LoroTree API to be clarified for parent relationships
   */
  getLexicalParentByLoroId(treeId: TreeID, loroTree: LoroTree): NodeKey | null {
    // TODO: Implement once LoroTree parent API is confirmed
    // For now, we'll rely on the bidirectional mapping without tree traversal
    return null;
  }

  /**
   * Manually set bidirectional mapping between Lexical NodeKey and Loro TreeID
   */
  setMapping(nodeKey: NodeKey, treeId: TreeID): void {
    this.lexicalToLoro.set(nodeKey, treeId);
    this.loroToLexical.set(treeId, nodeKey);
  }

  /**
   * Let a second Loro TreeID resolve to a Lexical key the primary mapping
   * already owns. Rooms written before roots were adopted rather than minted
   * hold one root per peer; aliasing the extras onto the Lexical root keeps
   * their subtrees in the document instead of orphaning them.
   */
  aliasLoroId(treeId: TreeID, nodeKey: NodeKey): void {
    this.loroToLexical.set(treeId, nodeKey);
  }

  /**
   * Create a new Loro TreeNode and establish mapping
   */
  private createLoroNode(
    nodeKey: NodeKey,
    lexicalNode?: LexicalNode,
    parentTreeID?: TreeID,
    index?: number
  ): TreeID {
    const insertionIndex = index;

    // Loro requires the insertion index to be within [0, children.length]. An
    // out-of-range index means the position was computed against stale/unsynced
    // siblings; surface it instead of silently clamping (which would drop the
    // node at the wrong position and hide the real ordering bug).
    if (insertionIndex !== undefined) {
      const parentNode =
        parentTreeID !== undefined ? this.tree.getNodeByID(parentTreeID) : null;
      const childrenLength = parentNode
        ? (parentNode.children()?.length ?? 0)
        : this.tree.roots().length;
      invariant(
        insertionIndex >= 0 && insertionIndex <= childrenLength,
        'createLoroNode: insertion index out of range',
        { nodeKey, parentTreeID, insertionIndex, childrenLength },
      );
    }

    // Create the tree node first
    const treeNode = this.tree.createNode(parentTreeID, insertionIndex);
    
    // Get the TreeID from the created node
    const treeId: TreeID = treeNode.id;
    
    // A requested parent must actually become this node's parent. If it does
    // not, the CRDT structure diverges from Lexical — surface it.
    if (parentTreeID) {
      const actualParent = treeNode.parent();
      invariant(
        actualParent != null && actualParent.id === parentTreeID,
        'createLoroNode: parent relationship not established',
        { nodeKey, expected: parentTreeID, actual: actualParent?.id ?? null },
      );
    }
    
    // Store basic metadata
    setNodeData(treeNode, 'createdAt', Date.now());
    
    // Store complete lexical node data if lexical node is provided
    if (lexicalNode) {
      try {
        const lexicalNodeJSON = lexicalNode.exportJSON();
        // Remove all key-related fields to avoid duplication (TreeID serves as the key)
        if ('key' in lexicalNodeJSON || '__key' in lexicalNodeJSON || 'lexicalKey' in lexicalNodeJSON) {
          const { key, __key, lexicalKey, children, ...cleanedData } = lexicalNodeJSON as any;
          setNodeData(treeNode, 'lexical', cleanedData);
        } else {
          const { children, ...cleanedData } = lexicalNodeJSON as any;
          setNodeData(treeNode, 'lexical', cleanedData);
        }
      } catch (error) {
        console.warn('Failed to export lexical node JSON in NodesMapper:', error);
      }
    }

    // Create bidirectional mapping
    this.createMapping(nodeKey, treeId);

    return treeId;
  }

  /**
   * Update the mapping when a node is moved or modified
   */
  updateMapping(oldNodeKey: NodeKey, newNodeKey: NodeKey): void {
    const treeId = this.lexicalToLoro.get(oldNodeKey);
    if (treeId) {
      this.removeMapping(oldNodeKey, treeId);
      this.createMapping(newNodeKey, treeId);
      
      // Update timestamp in tree node data
      const treeNode = this.tree.getNodeByID(treeId);
      if (treeNode) {
      }
    }
  }

  /**
   * Remove mapping when a node is deleted (also deletes from Loro tree).
   * Use this on the ORIGINATING side (propagation) where the local peer
   * is actively deleting a node.
   */
  deleteMapping(nodeKey: NodeKey): void {
    const treeId = this.lexicalToLoro.get(nodeKey);
    if (treeId) {
      this.removeMapping(nodeKey, treeId);
      
      // Delete the tree node
      if (isLiveTreeNode(this.tree, treeId)) {
        this.tree.delete(treeId);
      }
    }
  }

  /**
   * Remove bidirectional mapping WITHOUT deleting from the Loro tree.
   * Use this on the INTEGRATION side (receiving remote events) where the
   * Loro tree has already been updated by the remote peer — we only need
   * to clean up the local key↔TreeID association.
   */
  removeMappingForKey(nodeKey: NodeKey): void {
    const treeId = this.lexicalToLoro.get(nodeKey);
    if (treeId) {
      this.removeMapping(nodeKey, treeId);
    }
  }

  /**
   * Get TreeID by Lexical NodeKey (without creating if not found)
   */
  getTreeIDByLexicalKey(nodeKey: NodeKey): TreeID | undefined {
    return this.lexicalToLoro.get(nodeKey);
  }

  /**
   * Check if a mapping exists for a Lexical NodeKey
   */
  hasLexicalMapping(nodeKey: NodeKey): boolean {
    return this.lexicalToLoro.has(nodeKey);
  }

  /**
   * Check if a mapping exists for a Loro TreeID
   */
  hasLoroMapping(treeId: TreeID): boolean {
    return this.loroToLexical.has(treeId);
  }

  /**
   * Get all current mappings (for debugging)
   */
  getAllMappings(): { lexicalToLoro: Map<NodeKey, TreeID>; loroToLexical: Map<TreeID, NodeKey> } {
    return {
      lexicalToLoro: new Map(this.lexicalToLoro),
      loroToLexical: new Map(this.loroToLexical)
    };
  }

  /**
   * Clear all mappings (useful for testing or reset)
   */
  clearMappings(): void {
    this.lexicalToLoro.clear();
    this.loroToLexical.clear();
  }

  /**
   * Synchronize existing tree nodes with Lexical editor state
   * This should be called during initialization to establish mappings
   * 
   * Note: Since lexicalKey is no longer persisted in tree node data,
   * this method now relies on the TreeIntegrator to create mappings
   * as nodes are integrated from Loro tree operations.
   */
  syncExistingNodes(editorState: EditorState): void {
    // Since we no longer persist lexicalKey in tree node data,
    // we cannot automatically establish mappings from existing tree nodes.
    // 
    // Instead, mappings will be established through:
    // 1. TreeIntegrator processing tree diffs during initialization
    // 2. Normal collaboration flow as nodes are created/updated
    // 
    // This method is kept for compatibility but is now a no-op.
    console.log(' syncExistingNodes: Skipping sync - mappings established through TreeIntegrator');
  }
}

// Global instance to be shared across the application
let globalNodeMapper: NodeMapper | null = null;

/**
 * Initialize the global node mapper
 */
export function initializeNodeMapper(binding: Binding): NodeMapper {
  globalNodeMapper = new NodeMapper(binding);
  return globalNodeMapper;
}

/**
 * Run `fn` with `mapper` as the one `getNodeMapper()` answers.
 *
 * Two editors on one page are two bindings with two mappers, but the
 * propagators reach theirs through this module, where the last binding made
 * had left its own — so one pane's edits were written into the other pane's
 * document, under the other pane's peer. A propagation names its mapper first
 * and puts the previous one back when it is done; it runs synchronously, so
 * nothing else sees the swap.
 */
export function withNodeMapper<T>(mapper: NodeMapper, fn: () => T): T {
  const previous = globalNodeMapper;
  globalNodeMapper = mapper;
  try {
    return fn();
  } finally {
    globalNodeMapper = previous;
  }
}

/**
 * Get the global node mapper instance
 */
export function getNodeMapper(): NodeMapper {
  if (!globalNodeMapper) {
    throw new Error('NodeMapper not initialized. Call initializeNodeMapper() first.');
  }
  return globalNodeMapper;
}

/**
 * Utility functions for common operations
 */

/**
 * Get Loro TreeNode by Lexical NodeKey (using global mapper)
 */
export function getLoroNodeByLexicalKey(
  nodeKey: NodeKey,
  lexicalNode?: LexicalNode,
  parentTreeID?: TreeID,
  index?: number
): LoroTreeNode {
  return getNodeMapper().getLoroNodeByLexicalKey(nodeKey, lexicalNode, parentTreeID, index);
}

/**
 * Get Lexical NodeKey by Loro TreeID (using global mapper)
 */
export function getLexicalKeyByLoroId(treeId: TreeID): NodeKey | null {
  return getNodeMapper().getLexicalKeyByLoroId(treeId);
}

/**
 * Get Lexical Node by Loro TreeID (using global mapper)
 */
export function getLexicalNodeByLoroId(treeId: TreeID, editorState: EditorState): LexicalNode | null {
  return getNodeMapper().getLexicalNodeByLoroId(treeId, editorState);
}

// createLexicalNodeFromLoro function is now imported from NodeFactory
