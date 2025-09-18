import { TreeID, LoroTree } from 'loro-crdt';
import { $getRoot, NodeKey, RootNode } from 'lexical';
import { getNodeMapper } from '../utils/Nodes';

/**
 * RootNode Mutators for Loro Tree Collaboration
 * 
 * The RootNode is special in Lexical:
 * - Only one RootNode exists per EditorState
 * - Cannot be subclassed or replaced
 * - Represents the contenteditable element itself
 * - Does not participate in mutation listeners
 * - Has no parent or siblings
 * 
 * Note: RootNode typically doesn't need mutation handling since it's 
 * always present and doesn't change structure, but we include it for completeness
 */

export interface RootNodeMutatorOptions {
  binding: any;
  tree: LoroTree;
  peerId: number;
}

/**
 * Handle RootNode creation (typically only happens once during initialization)
 */
export function createRootNodeInLoro(
  nodeKey: number,
  lexicalNode?: any, // The actual Lexical RootNode instance
  options?: RootNodeMutatorOptions
): TreeID {
  const { tree, peerId } = options!;
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node
  // Root node has no parent (undefined) and is always at index 0
  const rootTreeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey.toString(),
    lexicalNode,
    undefined, // no parent for root
    0 // always at index 0
  );
  
  // Store metadata about this being a root node
  rootTreeNode.data.set('nodeType', 'root');
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return rootTreeNode.id;
}

/**
 * Handle RootNode updates (rarely needed since root doesn't change much)
 */
export function updateRootNodeInLoro(
  nodeKey: number,
  lexicalNode?: any, // The actual Lexical RootNode instance
  options?: RootNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey.toString(), lexicalNode);
  
    // Update any metadata if needed
    treeNode.data.set('lastUpdated', Date.now());
    
    // The exported Lexical node data is already handled by the mapper
    // No additional update needed since mapper handles exportJSON automatically
}

/**
 * Handle RootNode deletion (should rarely happen, but included for completeness)
 */
export function deleteRootNodeInLoro(
  nodeKey: number,
  options: RootNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Note: Deleting root node should be done with extreme caution
  // as it represents the entire editor content
  mapper.deleteMapping(nodeKey.toString());
}

/**
 * Create RootNode in Lexical from Loro tree data
 */
export function createRootNodeFromLoro(
  treeId: TreeID,
  options: RootNodeMutatorOptions
): RootNode | null {
  // In Lexical, there's always exactly one root node
  // This function would typically be called during initialization
  const root = $getRoot();
  
  // Root node already exists, just return it
  return root;
}

/**
 * Update RootNode in Lexical from Loro tree data
 */
export function updateRootNodeFromLoro(
  treeId: TreeID,
  options: RootNodeMutatorOptions
): void {
  // Root node updates are typically handled at the document level
  // Most changes to root would be indirect (children changes)
  console.log('Root node update from Loro:', treeId);
}

/**
 * Delete RootNode in Lexical (should not happen in normal operation)
 */
export function deleteRootNodeFromLoro(
  treeId: TreeID,
  options: RootNodeMutatorOptions
): void {
  // Root node deletion should not happen in normal circumstances
  // This would essentially clear the entire editor
  console.warn('Attempting to delete root node - this should not happen:', treeId);
}

/**
 * Utility to check if a tree node represents a RootNode
 */
export function isRootNodeInTree(treeId: TreeID, tree: LoroTree): boolean {
  if (!tree.has(treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'root';
}

/**
 * Main mutate method for RootNode - handles all mutation types
 */
export function mutateRootNode(
  update: any, // UpdateListenerPayload
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: number,
  options: RootNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      // Get the current editor state to find the root node
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && currentNode.getType() === 'root') {
        // For root node, there's no parent (it's the top-level)
        createRootNodeInLoro(nodeKey, currentNode, options);
      }
      break;
    }

    case 'updated': {
      // Root nodes typically don't change much, but we can update metadata
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && currentNode.getType() === 'root') {
        updateRootNodeInLoro(nodeKey, currentNode, options);
      }
      break;
    }

    case 'destroyed': {
      // Delete the root node from Loro tree
      deleteRootNodeInLoro(nodeKey, options);
      break;
    }
  }
}