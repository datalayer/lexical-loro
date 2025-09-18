import { TreeID, LoroTree } from 'loro-crdt';
import { $createLineBreakNode, LineBreakNode, $isLineBreakNode, NodeKey } from 'lexical';
import { getNodeMapper } from '../utils/Nodes';

/**
 * LineBreakNode Mutators for Loro Tree Collaboration
 * 
 * LineBreakNode characteristics:
 * - Represents '\n' characters in the editor
 * - Should never have '\n' in text nodes, use LineBreakNode instead
 * - Works consistently across browsers and operating systems
 * - Is a leaf node (cannot have children)
 * - Cannot be extended/subclassed
 */

export interface LineBreakNodeMutatorOptions {
  binding: any;
  tree: LoroTree;
  peerId: number;
}

/**
 * Create LineBreakNode in Loro tree
 */
export function createLineBreakNodeInLoro(
  nodeKey: number,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical LineBreakNode instance
  options?: LineBreakNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey.toString(),
    lexicalNode,
    parentId,
    index
  );
  
  // Store LineBreakNode metadata
  treeNode.data.set('nodeType', 'linebreak');
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return treeNode.id;
}

/**
 * Update LineBreakNode in Loro tree
 * Note: LineBreakNodes typically don't change much since they represent '\n'
 */
export function updateLineBreakNodeInLoro(
  nodeKey: number,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical LineBreakNode instance
  options?: LineBreakNodeMutatorOptions
): void {
  const { tree, peerId } = options!;
  const treeId: TreeID = `${nodeKey}@${peerId}`;
  
  if (tree.has(treeId)) {
    // Move the node if parent or position changed
    if (parentId !== undefined || index !== undefined) {
      tree.move(treeId, parentId, index);
    }
    
    // Update metadata
    const treeNode = tree.getNodeByID(treeId);
    if (treeNode) {
      treeNode.data.set('lastUpdated', Date.now());
      
      // Update the exported Lexical node data
      if (lexicalNode) {
        try {
          const exportedNode = lexicalNode.exportJSON();
          treeNode.data.set('node', JSON.stringify(exportedNode));
        } catch (error) {
          console.warn('Failed to export LineBreak node JSON during update:', error);
        }
      }
    }
  }
}

/**
 * Delete LineBreakNode from Loro tree
 */
export function deleteLineBreakNodeInLoro(
  nodeKey: number,
  options: LineBreakNodeMutatorOptions
): void {
  const { tree, peerId } = options;
  const treeId: TreeID = `${nodeKey}@${peerId}`;
  
  if (tree.has(treeId)) {
    tree.delete(treeId);
  }
}

/**
 * Create LineBreakNode in Lexical from Loro tree data
 */
export function createLineBreakNodeFromLoro(
  treeId: TreeID,
  parentNode: any, // The Lexical parent node where this should be inserted
  index?: number,
  options?: LineBreakNodeMutatorOptions
): LineBreakNode {
  const lineBreakNode = $createLineBreakNode();
  
  // Insert into the parent at the specified index
  if (index !== undefined && index >= 0) {
    parentNode.splice(index, 0, [lineBreakNode]);
  } else {
    parentNode.append(lineBreakNode);
  }
  
  return lineBreakNode;
}

/**
 * Update LineBreakNode in Lexical from Loro tree data
 */
export function updateLineBreakNodeFromLoro(
  treeId: TreeID,
  lexicalNode: LineBreakNode,
  newParentNode?: any,
  newIndex?: number,
  options?: LineBreakNodeMutatorOptions
): void {
  // If parent or position changed, move the node
  if (newParentNode && newIndex !== undefined) {
    // Remove from current location
    lexicalNode.remove();
    
    // Insert at new location
    newParentNode.splice(newIndex, 0, [lexicalNode]);
  }
}

/**
 * Delete LineBreakNode from Lexical
 */
export function deleteLineBreakNodeFromLoro(
  treeId: TreeID,
  lexicalNode: LineBreakNode,
  options?: LineBreakNodeMutatorOptions
): void {
  if ($isLineBreakNode(lexicalNode)) {
    lexicalNode.remove();
  }
}

/**
 * Utility to check if a tree node represents a LineBreakNode
 */
export function isLineBreakNodeInTree(treeId: TreeID, tree: LoroTree): boolean {
  if (!tree.has(treeId)) {
    return false;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  return treeNode?.data.get('nodeType') === 'linebreak';
}

/**
 * Get LineBreakNode data from Loro tree
 */
export function getLineBreakNodeDataFromTree(treeId: TreeID, tree: LoroTree): any {
  if (!tree.has(treeId)) {
    return null;
  }
  
  const treeNode = tree.getNodeByID(treeId);
  if (!treeNode || treeNode.data.get('nodeType') !== 'linebreak') {
    return null;
  }
  
  return {
    nodeType: 'linebreak',
    lexicalKey: treeNode.data.get('lexicalKey'),
    createdAt: treeNode.data.get('createdAt'),
    lastUpdated: treeNode.data.get('lastUpdated'),
  };
}

/**
 * Main mutate method for LineBreakNode - handles all mutation types
 */
export function mutateLineBreakNode(
  update: any, // UpdateListenerPayload
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: number,
  options: LineBreakNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isLineBreakNode(currentNode)) {
        // Get parent and index for proper positioning
        const parent = currentNode.getParent();
        const parentId = parent ? `${Number(parent.getKey())}@${peerId}` as TreeID : undefined;
        const index = currentNode.getIndexWithinParent();
        
        createLineBreakNodeInLoro(nodeKey, parentId, index, currentNode, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isLineBreakNode(currentNode)) {
        // Check if position changed
        const parent = currentNode.getParent();
        const parentId = parent ? `${Number(parent.getKey())}@${peerId}` as TreeID : undefined;
        const index = currentNode.getIndexWithinParent();
        
        updateLineBreakNodeInLoro(nodeKey, parentId, index, currentNode, options);
      }
      break;
    }

    case 'destroyed': {
      deleteLineBreakNodeInLoro(nodeKey, options);
      break;
    }
  }
}