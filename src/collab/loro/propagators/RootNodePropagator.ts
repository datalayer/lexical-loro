import { TreeID, LoroTree } from 'loro-crdt';
import { UpdateListenerPayload, NodeKey, RootNode, $getRoot } from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { Binding } from '../Bindings';

/**
 * RootNode Propagator for Loro Tree Collaboration
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
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
  
  // Store complete lexical node data in separate map if provided
  if (lexicalNodeJSON && options) {
    try {
      // Store complete lexical JSON without the key
      let cleanedData;
      if ('key' in lexicalNodeJSON || '__key' in lexicalNodeJSON) {
        const { key, __key, ...cleaned } = lexicalNodeJSON;
        cleanedData = cleaned;
      } else {
        cleanedData = lexicalNodeJSON;
      }
      
      // Get the document from the binding
      const doc = options.binding.doc;
      const lexicalMap = doc.getMap(`lexical-${rootTreeNode.id}`);
      lexicalMap.set('data', cleanedData);
    } catch (error) {
      console.warn('Failed to store lexical node JSON for RootNode:', error);
    }
  }
  
  // Store only essential metadata
  rootTreeNode.data.set('elementType', 'root');
  rootTreeNode.data.set('createdAt', Date.now());
  
  // The exported Lexical node data is already propagated by the mapper
  // Return the TreeID from the node's ID
  return rootTreeNode.id;
}

/**
 * Handle RootNode updates (rarely needed since root doesn't change much)
 */
export function updateRootNodeInLoro(
  nodeKey: NodeKey,
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: RootNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Get the existing tree node using the mapper (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  
  // Store complete lexical node data in separate map if provided
  if (lexicalNodeJSON && options) {
    try {
      // Store complete lexical JSON without the key
      let cleanedData;
      if ('key' in lexicalNodeJSON || '__key' in lexicalNodeJSON) {
        const { key, __key, ...cleaned } = lexicalNodeJSON;
        cleanedData = cleaned;
      } else {
        cleanedData = lexicalNodeJSON;
      }
      
      // Get the document from the binding
      const doc = options.binding.doc;
      const lexicalMap = doc.getMap(`lexical-${treeNode.id}`);
      lexicalMap.set('data', cleanedData);
    } catch (error) {
      console.warn('Failed to store lexical node JSON for RootNode update:', error);
    }
  }
  
  // Update only essential metadata
  treeNode.data.set('elementType', 'root');
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
  // Root node updates are typically propagated at the document level
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
 * Main propagate method for RootNode - propagates all mutation types
 */
export function propagateRootNode(
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
        // Export node data as JSON object within editor context where node methods are available
        let lexicalNodeJSON: any = undefined;
        
        update.editorState.read(() => {
          if (currentNode.getType() === 'root') {
            try {
              lexicalNodeJSON = currentNode.exportJSON();
            } catch (error) {
              console.warn('Failed to export root node JSON:', error);
            }
          }
        });
        
        if (lexicalNodeJSON) {
          createRootNodeInLoro(nodeKey, lexicalNodeJSON, options);
        }
      }
      break;
    }

    case 'updated': {
      // Root nodes typically don't change much, but we can update metadata
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode) {
        // Export node data as JSON object within editor context where node methods are available
        let lexicalNodeJSON: any = undefined;
        
        update.editorState.read(() => {
          if (currentNode.getType() === 'root') {
            try {
              lexicalNodeJSON = currentNode.exportJSON();
            } catch (error) {
              console.warn('Failed to export root node JSON for update:', error);
            }
          }
        });
        
        if (lexicalNodeJSON) {
          updateRootNodeInLoro(nodeKey, lexicalNodeJSON, options);
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