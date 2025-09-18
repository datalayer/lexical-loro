import { TreeID, LoroTree } from 'loro-crdt';
import { LexicalNode } from 'lexical';
import { createRootNodeFromLoro } from '../mutators/RootNodeMutators';
import { createElementNodeFromLoro } from '../mutators/ElementNodeMutators';
import { createTextNodeFromLoro } from '../mutators/TextNodeMutators';
import { createLineBreakNodeFromLoro } from '../mutators/LineBreakNodeMutators';
import { createDecoratorNodeFromLoro } from '../mutators/DecoratorNodeMutators';

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
  const nodeType = treeNode?.data.get('nodeType');
  
  if (!nodeType) {
    console.warn('No nodeType found for TreeID:', treeId);
    return null;
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