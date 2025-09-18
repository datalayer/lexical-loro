import { TreeID, LoroTree } from 'loro-crdt';
import { $createLineBreakNode, LineBreakNode, $isLineBreakNode, UpdateListenerPayload, NodeKey } from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';

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
  nodeKey: NodeKey,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical LineBreakNode instance
  options?: LineBreakNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    lexicalNode,
    parentId,
    index
  );
  
  // Store LineBreakNode metadata (minimal since it's just a line break)
  // nodeType is now handled by LexicalNodeData in mapper
  
  // The exported Lexical node data is already handled by the mapper
  // Return the TreeID from the node's ID
  return treeNode.id;
}

/**
 * Update LineBreakNode in Loro tree
 * Note: LineBreakNodes typically don't change much since they represent '\n'
 */
export function updateLineBreakNodeInLoro(
  nodeKey: NodeKey,
  parentId?: TreeID,
  index?: number,
  lexicalNode?: any, // The actual Lexical LineBreakNode instance
  options?: LineBreakNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  const { tree } = options!;
  
  // Get the existing Loro node from the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey);
  if (!treeNode) {
    return;
  }
  
  const treeId = treeNode.id;
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    tree.move(treeId, parentId, index);
  }
  
  // Update metadata
  treeNode.data.set('lastUpdated', Date.now());
  
  // Update the exported Lexical node data
  if (lexicalNode) {
    try {
      const lexicalNodeData: LexicalNodeData = { lexicalNode };
      const serializedData = LexicalNodeDataHelper.serialize(lexicalNodeData);
      treeNode.data.set('lexical', serializedData);
    } catch (error) {
      console.warn('Failed to serialize LineBreak LexicalNodeData during update:', error);
    }
  }
}

/**
 * Delete LineBreakNode from Loro tree
 */
export function deleteLineBreakNodeInLoro(
  nodeKey: NodeKey,
  options: LineBreakNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  
  // Use the mapper's delete method which handles TreeID lookup internally
  mapper.deleteMapping(nodeKey);
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
  const { tree } = options!;
  
  if (!tree.has(treeId)) {
    return $createLineBreakNode(); // Fallback to empty line break
  }
  
  const treeNode = tree.getNodeByID(treeId);
  let lineBreakNode: LineBreakNode;
  
  // Try to get LexicalNodeData first (new format)
  const lexicalData = treeNode?.data.get('lexical');
  
  if (lexicalData && typeof lexicalData === 'string') {
    try {
      const deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      const storedNode = deserializedData.lexicalNode;
      
      if (!$isLineBreakNode(storedNode)) {
        lineBreakNode = $createLineBreakNode(); // Fallback
      } else {
        lineBreakNode = storedNode;
      }
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      lineBreakNode = $createLineBreakNode(); // Fallback
    }
  } else {
    // Old format or no data - just create a new line break node
    lineBreakNode = $createLineBreakNode();
  }
  
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
  update: UpdateListenerPayload,
  mutation: 'created' | 'updated' | 'destroyed',
  nodeKey: NodeKey,
  options: LineBreakNodeMutatorOptions
): void {
  const { tree, peerId } = options;

  switch (mutation) {
    case 'created': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isLineBreakNode(currentNode)) {
        // Get parent and index for proper positioning using editor state context
        const { parentId, index } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          return { parentId, index };
        });
        
        createLineBreakNodeInLoro(nodeKey, parentId, index, currentNode, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isLineBreakNode(currentNode)) {
        // Check if position changed using editor state context
        const { parentId, index } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          return { parentId, index };
        });
        
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