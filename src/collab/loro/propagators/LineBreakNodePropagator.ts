import { TreeID, LoroTree } from 'loro-crdt';
import { $createLineBreakNode, LineBreakNode, $isLineBreakNode, UpdateListenerPayload, NodeKey, ElementNode } from 'lexical';
import { getNodeMapper } from '../nodes/NodesMapper';
import { LexicalNodeData } from '../types/LexicalNodeData';
import { Binding } from '../Bindings';

/**
 * LineBreakNode Propagator for Loro Tree Collaboration
 * 
 * LineBreakNode characteristics:
 * - Represents '\n' characters in the editor
 * - Should never have '\n' in text nodes, use LineBreakNode instead
 * - Works consistently across browsers and operating systems
 * - Is a leaf node (cannot have children)
 * - Cannot be extended/subclassed
 */

export interface LineBreakNodeMutatorOptions {
  binding: Binding;
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: LineBreakNodeMutatorOptions
): TreeID {
  const mapper = getNodeMapper();
  
  // Use mapper to get or create the tree node (don't pass lexicalNode to avoid context issues)
  const treeNode = mapper.getLoroNodeByLexicalKey(
    nodeKey,
    undefined, // don't pass lexicalNode to avoid context issues
    parentId,
    index
  );
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    // Store complete lexical JSON without the key
    const { key, ...cleanedData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedData);
  }
  
  // Store only essential metadata
  treeNode.data.set('elementType', 'linebreak');
  treeNode.data.set('createdAt', Date.now());
  
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
  lexicalNodeJSON?: any, // JSON object from exportJSON()
  options?: LineBreakNodeMutatorOptions
): void {
  const mapper = getNodeMapper();
  const { tree } = options!;
  
  // Get the existing Loro node from the mapper
  const treeNode = mapper.getLoroNodeByLexicalKey(nodeKey, undefined);
  if (!treeNode) {
    return;
  }
  
  const treeId = treeNode.id;
  
  // Store complete lexical node data as clean JSON if provided
  if (lexicalNodeJSON) {
    // Store complete lexical JSON without the key
    const { key, ...cleanedData } = lexicalNodeJSON;
    treeNode.data.set('lexical', cleanedData);
  }
  
  // Move the node if parent or position changed
  if (parentId !== undefined || index !== undefined) {
    tree.move(treeId, parentId, index);
  }
  
  // Update only essential metadata
  treeNode.data.set('elementType', 'linebreak');
  treeNode.data.set('lastUpdated', Date.now());
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
  parentNode: ElementNode,
  index?: number,
  options?: LineBreakNodeMutatorOptions
): LineBreakNode {
  const { tree } = options!;
  
  if (!tree.has(treeId)) {
    return $createLineBreakNode(); // Fallback to empty line break
  }
  
  const treeNode = tree.getNodeByID(treeId);
  let lineBreakNode: LineBreakNode;
  
  // Get LexicalNodeData (JSON object format only)
  const lexicalData = treeNode?.data.get('lexical');
  
  if (lexicalData && typeof lexicalData === 'object') {
    // lexicalData is a direct JSON object - LineBreak nodes are simple
    lineBreakNode = $createLineBreakNode();
  } else {
    // No lexical data - just create a new line break node
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
  newParentNode?: ElementNode,
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
        // Get parent, positioning, and JSON data using editor state context
        const { parentId, index, lexicalNodeJSON } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          // Export node data as JSON object within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node JSON in mutateLineBreakNode created:', error);
          }
          
          return { parentId, index, lexicalNodeJSON };
        });
        
        createLineBreakNodeInLoro(nodeKey, parentId, index, lexicalNodeJSON, options);
      }
      break;
    }

    case 'updated': {
      const currentNode = update.editorState._nodeMap.get(nodeKey);
      if (currentNode && $isLineBreakNode(currentNode)) {
        // Check if position changed and export data using editor state context
        const { parentId, index, lexicalNodeJSON } = update.editorState.read(() => {
          const parent = currentNode.getParent();
          // Get parentId from the mapper instead of constructing it manually
          const mapper = getNodeMapper();
          const parentId = parent ? mapper.getTreeIdByLexicalKey(parent.getKey()) : undefined;
          const index = currentNode.getIndexWithinParent();
          
          // Export node data within editor context where node methods are available
          let lexicalNodeJSON: any = undefined;
          try {
            lexicalNodeJSON = currentNode.exportJSON();
          } catch (error) {
            console.warn('Failed to export node data in mutateLineBreakNode updated:', error);
          }
          
          return { parentId, index, lexicalNodeJSON };
        });
        
        updateLineBreakNodeInLoro(nodeKey, parentId, index, lexicalNodeJSON, options);
      }
      break;
    }

    case 'destroyed': {
      deleteLineBreakNodeInLoro(nodeKey, options);
      break;
    }
  }
}