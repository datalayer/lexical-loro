import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode } from 'lexical';
import { createRootNodeFromLoro } from '../mutators/RootNodeMutators';
import { createElementNodeFromLoro } from '../mutators/ElementNodeMutators';
import { createTextNodeFromLoro } from '../mutators/TextNodeMutators';
import { createLineBreakNodeFromLoro } from '../mutators/LineBreakNodeMutators';
import { createDecoratorNodeFromLoro } from '../mutators/DecoratorNodeMutators';
import { LexicalNodeData, LexicalNodeDataHelper } from '../types/LexicalNodeData';

/**
 * Factory function to create Lexical nodes from Loro TreeID
 */
export function createLexicalNodeFromLoro(
  treeId: TreeID, 
  loroTree: LoroTree,
  parentLexicalNode?: LexicalNode,
  index?: number,
  options?: any
): LexicalNode | null {
  // Get node data from Loro tree
  if (!loroTree.has(treeId)) {
    return null;
  }

  const treeNode = loroTree.getNodeByID(treeId);
  const lexicalData = treeNode?.data.get('lexical');
  
  let nodeType: string;
  if (lexicalData && typeof lexicalData === 'string') {
    // New format: deserialize LexicalNodeData to get the nodeType
    try {
      const deserializedData = LexicalNodeDataHelper.deserialize(lexicalData);
      nodeType = deserializedData.lexicalNode.getType();
    } catch (error) {
      console.warn('Failed to deserialize LexicalNodeData for TreeID:', treeId, error);
      return null;
    }
  } else {
    // Fallback to old format for backward compatibility
    const oldNodeType = treeNode?.data.get('nodeType');
    if (!oldNodeType || typeof oldNodeType !== 'string') {
      console.warn('No lexical data or nodeType found for TreeID:', treeId);
      return null;
    }
    nodeType = oldNodeType;
  }

  // Call appropriate mutator based on node type
  switch (nodeType) {
    case 'root':
      return createRootNodeFromLoro(treeId, { tree: loroTree, ...options });
      
    case 'element':
    case 'paragraph':
    case 'heading':
      return createElementNodeFromLoro(treeId, parentLexicalNode, index, { tree: loroTree, ...options });
      
    case 'text':
      return createTextNodeFromLoro(treeId, parentLexicalNode, index, { tree: loroTree, ...options });
      
    case 'linebreak':
      return createLineBreakNodeFromLoro(treeId, parentLexicalNode, index, { tree: loroTree, ...options });
      
    case 'decorator':
      return createDecoratorNodeFromLoro(treeId, parentLexicalNode, index, { tree: loroTree, ...options });
      
    default:
      console.warn('Unknown nodeType for Loro->Lexical conversion:', nodeType);
      return null;
  }
}