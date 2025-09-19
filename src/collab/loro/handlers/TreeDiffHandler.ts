import { $getRoot, $isElementNode, $getNodeByKey } from 'lexical';
import { TreeID } from 'loro-crdt';
import { BaseDiffHandler } from './BaseDiffHandler';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { parseTreeID } from '../utils/Utils';
import { createLexicalNodeFromLoro } from '../nodes/NodeFactory';

interface TreeDiff {
  type: 'tree';
  diff: Array<{
    action: 'create' | 'move' | 'delete';
    target: TreeID;
    parent?: TreeID;
    index?: number;
  }>;
}

/**
 * Handles tree structure changes (node creation, movement, deletion)
 */
export class TreeDiffHandler implements BaseDiffHandler<TreeDiff> {
  
  handle(diff: TreeDiff, binding: Binding, provider: Provider): void {
    console.log('🌳 Handling TreeDiff:', diff);
    
    diff.diff.forEach(treeChange => {
      switch (treeChange.action) {
        case 'create':
          this.handleCreate(treeChange, binding, provider);
          break;
        case 'move':
          this.handleMove(treeChange, binding, provider);
          break;
        case 'delete':
          this.handleDelete(treeChange, binding, provider);
          break;
        default:
          throw new Error(`Unknown tree change action: ${(treeChange as any).action}`);
      }
    });
  }

  private handleCreate(
    treeChange: { target: TreeID; parent?: TreeID; index?: number }, 
    binding: Binding, 
    provider: Provider
  ): void {
    const { nodeKey, peerId } = parseTreeID(treeChange.target);
    const tree = binding.tree;

    // Get the tree node to determine its type and data
    if (!tree.has(treeChange.target)) {
      console.warn(`🌳 Tree node ${treeChange.target} not found during create`);
      return;
    }

    const treeNode = tree.getNodeByID(treeChange.target);
    const nodeData = Object.fromEntries(treeNode.data.entries());
    const elementType = nodeData.elementType;

    console.log(`🌳 Creating Lexical node from Loro: type=${elementType}, key=${nodeKey}`, nodeData);

    // Skip if this peer initiated the change (avoid circular updates)
    if (peerId === binding.clientID) {
      console.log(`🌳 Skipping creation from same peer: ${peerId}`);
      return;
    }

    binding.editor.update(() => {
      // Check if node already exists to avoid duplicates
      const existingNode = $getNodeByKey(nodeKey);
      if (existingNode) {
        console.log(`🌳 Node ${nodeKey} already exists in Lexical, skipping creation`);
        return;
      }

      // Get parent node from Loro tree structure if available
      const parentTreeId = treeChange.parent;
      let parentLexicalNode;
      
      if (parentTreeId) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(parentTreeId);
        parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
      }
      
      // Default to root if no parent found
      if (!parentLexicalNode) {
        parentLexicalNode = $getRoot();
      }

      // Create the Lexical node using the NodeFactory
      const lexicalNode = createLexicalNodeFromLoro(
        treeChange.target,
        tree,
        parentLexicalNode,
        treeChange.index,
        { tree, binding, provider }
      );

      if (lexicalNode && parentLexicalNode && $isElementNode(parentLexicalNode)) {
        // Insert the node at the specified index
        if (typeof treeChange.index === 'number') {
          parentLexicalNode.splice(treeChange.index, 0, [lexicalNode]);
        } else {
          parentLexicalNode.append(lexicalNode);
        }
        
        console.log(`🌳 Successfully created and inserted node ${nodeKey} into parent`);
      } else {
        console.warn(`🌳 Failed to create or insert node ${nodeKey}:`, {
          hasLexicalNode: !!lexicalNode,
          hasParent: !!parentLexicalNode,
          isParentElement: parentLexicalNode ? $isElementNode(parentLexicalNode) : false
        });
      }
    }, { tag: 'loro-sync' });
  }

  private handleMove(
    treeChange: { target: TreeID; parent?: TreeID; index?: number }, 
    binding: Binding, 
    provider: Provider
  ): void {
    const { nodeKey, peerId } = parseTreeID(treeChange.target);
    console.log(`🌳 Moving Lexical node from Loro: key=${nodeKey}`);

    // Skip if this peer initiated the change
    if (peerId === binding.clientID) {
      console.log(`🌳 Skipping move from same peer: ${peerId}`);
      return;
    }

    binding.editor.update(() => {
      const nodeToMove = $getNodeByKey(nodeKey);
      if (!nodeToMove) {
        console.warn(`🌳 Node ${nodeKey} not found for move operation`);
        return;
      }

      // Get new parent
      const parentTreeId = treeChange.parent;
      let newParentLexicalNode;
      
      if (parentTreeId) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(parentTreeId);
        newParentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
      }
      
      if (!newParentLexicalNode) {
        newParentLexicalNode = $getRoot();
      }

      if ($isElementNode(newParentLexicalNode)) {
        // Remove from current parent
        nodeToMove.remove();
        
        // Insert at new location
        if (typeof treeChange.index === 'number') {
          newParentLexicalNode.splice(treeChange.index, 0, [nodeToMove]);
        } else {
          newParentLexicalNode.append(nodeToMove);
        }
        
        console.log(`🌳 Successfully moved node ${nodeKey} to new parent`);
      }
    }, { tag: 'loro-sync' });
  }

  private handleDelete(
    treeChange: { target: TreeID }, 
    binding: Binding, 
    provider: Provider
  ): void {
    const { nodeKey, peerId } = parseTreeID(treeChange.target);
    console.log(`🌳 Deleting Lexical node from Loro: key=${nodeKey}`);

    // Skip if this peer initiated the change
    if (peerId === binding.clientID) {
      console.log(`🌳 Skipping delete from same peer: ${peerId}`);
      return;
    }

    binding.editor.update(() => {
      const nodeToDelete = $getNodeByKey(nodeKey);
      if (nodeToDelete) {
        nodeToDelete.remove();
        console.log(`🌳 Successfully deleted node ${nodeKey}`);
      } else {
        console.warn(`🌳 Node ${nodeKey} not found for deletion`);
      }
    }, { tag: 'loro-sync' });
  }
}
