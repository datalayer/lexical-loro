import { $getRoot, $isElementNode, $getNodeByKey, $isRootNode } from 'lexical';
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

      // Check the node type before creating to avoid root node issues
      const treeNode = tree.getNodeByID(treeChange.target);
      const lexicalData = treeNode?.data.get('lexical');
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
        
        // Insert the node at the specified index
        if (typeof treeChange.index === 'number') {
          // Validate index bounds
          const currentChildrenCount = parentLexicalNode.getChildrenSize();
          const safeIndex = Math.min(treeChange.index, currentChildrenCount);
          
          if (safeIndex < 0) {
            console.warn(`🌳 Invalid index ${treeChange.index}, appending to end`);
            parentLexicalNode.append(lexicalNode);
          } else {
            console.log(`🌳 Inserting at index ${safeIndex} (requested: ${treeChange.index}, max: ${currentChildrenCount})`);
            parentLexicalNode.splice(safeIndex, 0, [lexicalNode]);
          }
        } else {
          parentLexicalNode.append(lexicalNode);
        }
        
        console.log(`🌳 Successfully created and inserted node ${nodeKey} into parent`);
      } else {
        console.warn(`🌳 Failed to create or insert node ${nodeKey}:`, {
          hasLexicalNode: !!lexicalNode,
          hasParent: !!parentLexicalNode,
          isParentElement: parentLexicalNode ? $isElementNode(parentLexicalNode) : false,
          nodeType: lexicalNode?.getType(),
          parentType: parentLexicalNode?.getType()
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
