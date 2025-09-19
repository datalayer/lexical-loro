import { LoroTree, LoroTreeNode, TreeID } from 'loro-crdt';
import { LexicalNode, NodeKey, EditorState } from 'lexical';
import { Binding } from '../Bindings';
import { LexicalNodeData } from '../types/LexicalNodeData';

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
    parentTreeId?: TreeID,
    index?: number
  ): LoroTreeNode {
    // Check if mapping already exists
    const existingTreeId = this.lexicalToLoro.get(nodeKey);
    if (existingTreeId && this.tree.has(existingTreeId)) {
      return this.tree.getNodeByID(existingTreeId)!;
    }

    // Get parent TreeID from Lexical node if not provided
    if (!parentTreeId && lexicalNode) {
      const lexicalParent = lexicalNode.getParent();
      if (lexicalParent) {
        const parentKey = lexicalParent.getKey();
        parentTreeId = this.lexicalToLoro.get(parentKey);
        
        // If parent doesn't exist in Loro, create it first
        if (!parentTreeId) {
          const parentLoroNode = this.getLoroNodeByLexicalKey(
            parentKey,
            lexicalParent,
            undefined,
            undefined
          );
          parentTreeId = parentLoroNode.id;
        }
      }
    }

    // Get index from Lexical node if not provided
    if (index === undefined && lexicalNode) {
      index = lexicalNode.getIndexWithinParent();
    }

    // Create new tree node if it doesn't exist
    const newTreeId = this.createLoroNode(nodeKey, lexicalNode, parentTreeId, index);
    return this.tree.getNodeByID(newTreeId)!;
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
    // The caller should handle Lexical node creation
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
   * Create a new Loro TreeNode and establish mapping
   */
  private createLoroNode(
    nodeKey: NodeKey,
    lexicalNode?: LexicalNode,
    parentTreeId?: TreeID,
    index?: number
  ): TreeID {
    // Create the tree node first
    const treeNode = this.tree.createNode(parentTreeId, index);
    
    // Get the TreeID from the created node
    const treeId: TreeID = treeNode.id;
    
    // Debug logging for parent relationship issues
    if (parentTreeId) {
      const actualParent = treeNode.parent();
      if (!actualParent || actualParent.id !== parentTreeId) {
        console.warn(`⚠️  Parent relationship not set correctly for ${nodeKey}: expected ${parentTreeId}, got ${actualParent?.id || 'None'}`);
      }
    }
    
    // Store basic metadata
    treeNode.data.set('createdAt', Date.now());
    
    // Store complete lexical node data if lexical node is provided
    if (lexicalNode) {
      try {
        const lexicalNodeJSON = lexicalNode.exportJSON();
        // Remove key if it exists to avoid duplication (TreeID serves as the key)
        if ('key' in lexicalNodeJSON) {
          const { key, ...cleanedData } = lexicalNodeJSON;
          treeNode.data.set('lexical', cleanedData);
        } else {
          treeNode.data.set('lexical', lexicalNodeJSON);
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
        treeNode.data.set('updatedAt', Date.now());
      }
    }
  }

  /**
   * Remove mapping when a node is deleted
   */
  deleteMapping(nodeKey: NodeKey): void {
    const treeId = this.lexicalToLoro.get(nodeKey);
    if (treeId) {
      this.removeMapping(nodeKey, treeId);
      
      // Delete the tree node
      if (this.tree.has(treeId)) {
        this.tree.delete(treeId);
      }
    }
  }

  /**
   * Get TreeID by Lexical NodeKey (without creating if not found)
   */
  getTreeIdByLexicalKey(nodeKey: NodeKey): TreeID | undefined {
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
   */
  syncExistingNodes(editorState: EditorState): void {
    // Iterate through all tree nodes and establish mappings
    this.tree.nodes().forEach((treeNode) => {
      const lexicalKey = treeNode.data.get('lexicalKey') as NodeKey;
      if (lexicalKey && editorState._nodeMap.has(lexicalKey)) {
        // Recreate mapping if both nodes exist
        const treeId = treeNode.id;
        this.createMapping(lexicalKey, treeId);
      }
    });

    // Iterate through Lexical nodes and create tree nodes for unmapped ones
    editorState._nodeMap.forEach((lexicalNode, nodeKey) => {
      if (!this.hasLexicalMapping(nodeKey)) {
        // Create tree node for unmapped Lexical nodes
        const parent = lexicalNode.getParent();
        const parentTreeId = parent ? this.lexicalToLoro.get(parent.getKey()) : undefined;
        const index = lexicalNode.getIndexWithinParent();
        
        this.createLoroNode(nodeKey, lexicalNode, parentTreeId, index);
      }
    });
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
  parentTreeId?: TreeID,
  index?: number
): LoroTreeNode {
  return getNodeMapper().getLoroNodeByLexicalKey(nodeKey, lexicalNode, parentTreeId, index);
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
