import { 
  $getRoot, 
  $isElementNode, 
  $getNodeByKey, 
  $isRootNode, 
  $insertNodes,
  $getSelection,
  $createRangeSelection,
  $setSelection
} from 'lexical';
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
    
    // Ensure root mapping is preserved
    this.ensureRootMapping(binding);
    
    // Batch all tree changes into a single editor update to avoid reconciliation issues
    binding.editor.update(() => {
      diff.diff.forEach(treeChange => {
        switch (treeChange.action) {
          case 'create':
            this.handleCreateInternal(treeChange, binding, provider);
            break;
          case 'move':
            this.handleMoveInternal(treeChange, binding, provider);
            break;
          case 'delete':
            this.handleDeleteInternal(treeChange, binding, provider);
            break;
          default:
            throw new Error(`Unknown tree change action: ${(treeChange as any).action}`);
        }
      });
    }, { tag: 'loro-tree-batch' });
  }

  private handleCreateInternal(
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

    const loroTreeNode = tree.getNodeByID(treeChange.target);
    const nodeData = Object.fromEntries(loroTreeNode.data.entries());
    const elementType = nodeData.elementType;

    console.log(`🌳 Creating Lexical node from Loro: type=${elementType}, key=${nodeKey}`, nodeData);

    // Skip if this peer initiated the change (avoid circular updates)
    if (peerId === binding.clientID) {
      console.log(`🌳 Skipping creation from same peer: ${peerId}`);
      return;
    }

    // Check if node already exists to avoid duplicates ($ method - already in editor.update)
    const existingNode = $getNodeByKey(nodeKey);
    if (existingNode) {
      console.log(`🌳 Node ${nodeKey} already exists in Lexical, skipping creation`);
      return;
    }

    // Get parent node from Loro tree structure if available ($ methods - already in editor.update)
    const parentTreeId = treeChange.parent;
    let parentLexicalNode;
    
    if (parentTreeId) {
      const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(parentTreeId);
      parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
    }
    
    // Default to root if no parent found ($ method - already in editor.update)
    if (!parentLexicalNode) {
      parentLexicalNode = $getRoot();
    }

    // Check the node type before creating to avoid root node issues
    const lexicalData = loroTreeNode?.data.get('lexical');
    if (lexicalData && typeof lexicalData === 'string') {
      try {
        const deserializedData = JSON.parse(lexicalData);
        const nodeType = deserializedData.lexicalNode?.__type;
        
        // Skip root nodes - they should not be created as children
        if (nodeType === 'root') {
          console.warn(`🌳 Skipping creation of root node - this should not happen`);
          return;
        }
      } catch (error) {
        console.warn('Failed to parse node data for type check:', error);
      }
    }

      // Create the Lexical node using the NodeFactory
      const lexicalNode = createLexicalNodeFromLoro(
        treeChange.target,
        tree,
        binding,
        parentLexicalNode?.getKey()
      );

      // Set up bidirectional mapping between TreeID and Lexical key
      if (lexicalNode) {
        binding.nodeMapper.setMapping(lexicalNode.getKey(), treeChange.target);
      }

      if (lexicalNode && parentLexicalNode && $isElementNode(parentLexicalNode)) {
        // Safety check: Don't try to append a RootNode to another RootNode
        if ($isRootNode(lexicalNode) && $isRootNode(parentLexicalNode)) {
          console.warn(`🌳 Attempting to append RootNode to RootNode - skipping insertion`);
          return;
        }
        
        // Use Lexical's proper command system for inserting nodes
        try {
          // Create a selection at the target position within the parent
          let targetIndex = treeChange.index;
          if (typeof targetIndex !== 'number') {
            targetIndex = parentLexicalNode.getChildrenSize(); // Append to end
          }
          
          // Validate index bounds
          const currentChildrenCount = parentLexicalNode.getChildrenSize();
          if (targetIndex < 0 || targetIndex > currentChildrenCount) {
            console.warn(`🌳 Invalid index ${targetIndex}, using end position`);
            targetIndex = currentChildrenCount;
          }
          
          // Create a range selection at the target position
          const selection = $createRangeSelection();
          selection.anchor.set(parentLexicalNode.getKey(), targetIndex, 'element');
          selection.focus.set(parentLexicalNode.getKey(), targetIndex, 'element');
          $setSelection(selection);
          
          // Use Lexical's $insertNodes utility to insert the node properly
          $insertNodes([lexicalNode]);
          
          console.log(`🌳 Successfully inserted node ${nodeKey} at index ${targetIndex} using Lexical commands`);
        } catch (error) {
          console.error(`🌳 Failed to insert node ${nodeKey} using commands:`, error);
          // Fallback to direct insertion if command fails
          try {
            parentLexicalNode.append(lexicalNode);
            console.log(`🌳 Fallback: Successfully appended node ${nodeKey} directly`);
          } catch (fallbackError) {
            console.error(`🌳 Fallback insertion also failed:`, fallbackError);
          }
        }
      } else {
        console.warn(`🌳 Failed to create or insert node ${nodeKey}:`, {
          hasLexicalNode: !!lexicalNode,
          hasParent: !!parentLexicalNode,
          isParentElement: parentLexicalNode ? $isElementNode(parentLexicalNode) : false,
          nodeType: lexicalNode?.getType(),
          parentType: parentLexicalNode?.getType()
        });
      }
  }

  private handleMoveInternal(
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
        try {
          // Use Lexical commands for moving nodes
          let targetIndex = treeChange.index;
          if (typeof targetIndex !== 'number') {
            targetIndex = newParentLexicalNode.getChildrenSize(); // Append to end
          }
          
          // Validate index bounds
          const currentChildrenCount = newParentLexicalNode.getChildrenSize();
          if (targetIndex < 0 || targetIndex > currentChildrenCount) {
            console.warn(`🌳 Invalid move index ${targetIndex}, using end position`);
            targetIndex = currentChildrenCount;
          }
          
          // Remove from current parent (this is allowed as a $ method)
          nodeToMove.remove();
          
          // Create a selection at the target position in the new parent
          const selection = $createRangeSelection();
          selection.anchor.set(newParentLexicalNode.getKey(), targetIndex, 'element');
          selection.focus.set(newParentLexicalNode.getKey(), targetIndex, 'element');
          $setSelection(selection);
          
          // Use $insertNodes to insert at the correct position
          $insertNodes([nodeToMove]);
          
          console.log(`🌳 Successfully moved node ${nodeKey} to new parent at index ${targetIndex}`);
        } catch (error) {
          console.error(`🌳 Failed to move node ${nodeKey} using commands:`, error);
          // Fallback to direct manipulation if needed
          try {
            if (typeof treeChange.index === 'number') {
              newParentLexicalNode.splice(treeChange.index, 0, [nodeToMove]);
            } else {
              newParentLexicalNode.append(nodeToMove);
            }
            console.log(`🌳 Fallback: Successfully moved node ${nodeKey} directly`);
          } catch (fallbackError) {
            console.error(`🌳 Fallback move also failed:`, fallbackError);
          }
        }
      }
  }

  private handleDeleteInternal(
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

    const nodeToDelete = $getNodeByKey(nodeKey);
    if (nodeToDelete) {
      nodeToDelete.remove();
      console.log(`🌳 Successfully deleted node ${nodeKey}`);
    } else {
      console.warn(`🌳 Node ${nodeKey} not found for deletion`);
    }
  }

  /**
   * Ensure that the Loro root is always mapped to the Lexical root key
   */
  private ensureRootMapping(binding: Binding): void {
    binding.editor.getEditorState().read(() => {
      const lexicalRoot = $getRoot();
      const loroRoots = binding.tree.roots();
      
      if (loroRoots.length > 0) {
        const loroRootId = loroRoots[0].id;
        const currentMapping = binding.nodeMapper.getLexicalKeyByLoroId(loroRootId);
        
        if (!currentMapping || currentMapping === 'no-key') {
          binding.nodeMapper.setMapping(lexicalRoot.getKey(), loroRootId);
          console.log(`🌳 Established root mapping: ${lexicalRoot.getKey()} ↔ ${loroRootId}`);
        }
      }
    });
  }
}
