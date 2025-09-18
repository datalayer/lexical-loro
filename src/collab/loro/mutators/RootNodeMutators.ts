import { TreeID, LoroTree } from 'loro-crdt';
import { UpdateListenerPayload, NodeKey, RootNode, $getRoot } from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';

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
  binding: Binding;
  tree: LoroTree;
  peerId: number;
}

/**
 * Handle RootNode creation (typically only happens once during initialization)
 */
export function createRootNodeInLoro(
  nodeKey: NodeKey,
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: RootNodeMutatorOptions
): TreeID {
  const { tree, peerId } = options!;
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node (don't pass lexicalNode to avoid context issues)
  // Root node has no parent (undefined) and is always at index 0
  const rootTreeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    undefined, // don't pass lexicalNode to avoid context issues
    undefined, // no parent for root
    0 // always at index 0
  );
  
  // Store complete lexical node data if serialized data is provided
  if (serializedNodeData) {
    rootTreeNode.data.set('lexical', serializedNodeData);
  }
  
  // Store metadata about this being a root node (useful for debugging)
  rootTreeNode.data.set('elementType', 'root'); // Set element type for debug panel
  rootTreeNode.data.set('isRoot', true);
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return rootTreeNode.id;
}

/**
 * Handle RootNode updates (rarely needed since root doesn't change much)
 */
export function updateRootNodeInLoro(
  nodeKey: NodeKey,
  serializedNodeData?: string, // Pre-serialized lexical node data
  options?: RootNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data if serialized data is provided
  if (serializedNodeData) {
    treeNode.data.set('lexical', serializedNodeData);
  }
  
  // Update any metadata if needed
  treeNode.data.set('elementType', 'root'); // Ensure element type is set for debug panel
  treeNode.data.set('lastUpdated', Date.now());
}

/**
 * Handle RootNode deletion (should rarely happen, but included for completeness)
 */
export function deleteRootNodeInLoro(
  nodeKey: NodeKey,
  options: RootNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Note: Deleting root node should be done with extreme caution
  // as it represents the entire editor content
  mapper.deleteMapping(nodeKey);
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
  update: UpdateListenerPayload,
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: NodeKey,
  options: RootNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      // Get the current editor state to find the root node
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode) {
        // Serialize node data within editor context where node methods are available
        let serializedNodeData: string | undefined;
        
        update.editorState.read(() => {
          if (currentNode.getType() === 'root') {
            const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
            serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
          }
        });
        
        if (serializedNodeData) {
          createRootNodeInLoro(nodeKey, serializedNodeData, options);
        }
      }
      break;
    }

    case 'updated': {
      // Root nodes typically don't change much, but we can update metadata
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode) {
        // Serialize node data within editor context where node methods are available
        let serializedNodeData: string | undefined;
        
        update.editorState.read(() => {
          if (currentNode.getType() === 'root') {
            const lexicalNodeData: LexicalNodeData = { lexicalNode: currentNode };
            serializedNodeData = LexicalNodeDataHelper.serialize(lexicalNodeData);
          }
        });
        
        if (serializedNodeData) {
          updateRootNodeInLoro(nodeKey, serializedNodeData, options);
        }
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