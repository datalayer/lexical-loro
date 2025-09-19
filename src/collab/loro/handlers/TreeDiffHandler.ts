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
      // Sort create operations to ensure parents are processed before children
      const createOps = diff.diff.filter(change => change.action === 'create') as Array<{ action: 'create'; target: TreeID; parent?: TreeID; index?: number }>;
      const otherOps = diff.diff.filter(change => change.action !== 'create');
      
      // Sort creates by hierarchy depth (parents first, then children)
      const sortedCreates = this.sortCreatesByHierarchy(createOps, binding, provider);
      
      // Process creates first (in sorted order), then other operations
      [...sortedCreates, ...otherOps].forEach(treeChange => {
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
    const { nodeKey } = parseTreeID(treeChange.target);
    const tree = binding.tree;

    // Get the tree node to determine its type and data
    if (!tree.has(treeChange.target)) {
      console.warn(`🌳 Tree node ${treeChange.target} not found during create`);
      return;
    }

    const loroTreeNode = tree.getNodeByID(treeChange.target);
    const nodeData = Object.fromEntries(loroTreeNode.data.entries());
    const elementType = nodeData.elementType;

    // Early check for root node type to avoid unnecessary processing
    const lexicalData = loroTreeNode?.data.get('lexical');
    if (lexicalData && typeof lexicalData === 'string') {
      try {
        const deserializedData = JSON.parse(lexicalData);
        const nodeType = deserializedData.lexicalNode?.__type;
        
        // Skip root nodes - they should not be created as children
        if (nodeType === 'root') {
          console.log(`🌳 Skipping root node creation during initialization - root already exists`);
          return;
        }
      } catch (error) {
        console.warn('Failed to parse node data for type check:', error);
      }
    }

    console.log(`🌳 Creating Lexical node from Loro: type=${elementType}, key=${nodeKey}`, nodeData);

    // Check if node already exists to avoid duplicates ($ method - already in editor.update)
    const existingNode = $getNodeByKey(nodeKey);
    if (existingNode) {
      console.log(`🌳 Node ${nodeKey} already exists in Lexical, skipping creation`);
      return;
    }

    // Get parent node from Loro tree structure if available ($ methods - already in editor.update)
    const parentTreeId = treeChange.parent;
    let parentLexicalNode;
    
    console.log(`🌳 Looking for parent: treeId=${parentTreeId}, targetNode=${nodeKey}, type=${elementType}`);
    
    if (parentTreeId) {
      const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(parentTreeId);
      parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
      console.log(`🌳 Parent mapping: ${parentTreeId} → ${parentKey} → ${parentLexicalNode?.getType() || 'null'}`);
    }
    
    // Default to root if no parent found ($ method - already in editor.update)
    if (!parentLexicalNode) {
      parentLexicalNode = $getRoot();
      console.log(`🌳 Using root as parent for ${nodeKey}`);
      
      // Safety check: Text nodes cannot be direct children of root
      if (elementType === 'text') {
        console.warn(`🌳 Cannot insert text node ${nodeKey} directly into root. Skipping creation.`);
        return;
      }
    }

    // Create the Lexical node using the NodeFactory
    let lexicalNode;
    try {
      // Pass nodeData so NodeFactory can access lexical data immediately
      lexicalNode = createLexicalNodeFromLoro(
        treeChange.target,
        tree,
        binding,
        undefined, // parentKey - not used anymore
        nodeData   // pass the node data from Loro
      );

      // Set up bidirectional mapping between TreeID and Lexical key
      if (lexicalNode) {
        binding.nodeMapper.setMapping(lexicalNode.getKey(), treeChange.target);
        console.log(`🌳 Successfully created and mapped node ${nodeKey} (${elementType})`);
      } else {
        console.warn(`🌳 Failed to create node ${nodeKey} (${elementType}) - NodeFactory returned null`);
        return;
      }
    } catch (nodeCreationError) {
      console.error(`🌳 Exception during node creation for ${nodeKey} (${elementType}):`, nodeCreationError);
      return;
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
          
          // Debug the node and parent before insertion
          console.log(`🌳 About to insert node ${nodeKey} (type: ${lexicalNode.getType()}) into parent ${parentLexicalNode.getKey()} (type: ${parentLexicalNode.getType()})`);
          console.log(`🌳 Node type: ${lexicalNode.getType()}, Parent can have children: ${$isElementNode(parentLexicalNode)}`);
          console.log(`🌳 Parent children before: ${parentLexicalNode.getChildrenSize()}`);
          
          // Use $ methods for proper tree building (we're already inside editor.update)
          if (targetIndex >= parentLexicalNode.getChildrenSize()) {
            // Append at end using $ method
            parentLexicalNode.append(lexicalNode);
            console.log(`🌳 Appended node ${nodeKey} to parent ${parentLexicalNode.getKey()}`);
          } else {
            // Insert at specific index using $ method
            const childAtIndex = parentLexicalNode.getChildAtIndex(targetIndex);
            if (childAtIndex) {
              childAtIndex.insertBefore(lexicalNode);
              console.log(`🌳 Inserted node ${nodeKey} before child at index ${targetIndex}`);
            } else {
              parentLexicalNode.append(lexicalNode);
              console.log(`🌳 Appended node ${nodeKey} (no child at index)`);
            }
          }
          
          console.log(`🌳 Parent children after: ${parentLexicalNode.getChildrenSize()}`);
          console.log(`🌳 Node parent after insertion: ${lexicalNode.getParent()?.getKey() || 'none'} (${lexicalNode.getParent()?.getType() || 'none'})`);
          
          // Verify the node was properly inserted (we already have the node object)
          if (lexicalNode.getParent()) {
            console.log(`🌳 ✅ Node ${nodeKey} (Lexical key: ${lexicalNode.getKey()}, type: ${lexicalNode.getType()}) successfully inserted`);
          } else {
            console.warn(`🌳 ❌ Node ${nodeKey} (Lexical key: ${lexicalNode.getKey()}) insertion failed - no parent`);
          }
        } catch (error) {
          console.error(`🌳 Failed to insert node ${nodeKey} using direct methods:`, error);
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
    const { nodeKey } = parseTreeID(treeChange.target);
    console.log(`🌳 Moving Lexical node from Loro: key=${nodeKey}`);

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
    const { nodeKey } = parseTreeID(treeChange.target);
    console.log(`🌳 Deleting Lexical node from Loro: key=${nodeKey}`);

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

  /**
   * Sort create operations to ensure parents are processed before children
   */
  private sortCreatesByHierarchy(
    createOps: Array<{ action: 'create'; target: TreeID; parent?: TreeID; index?: number }>,
    binding: Binding,
    provider: Provider
  ): Array<{ action: 'create'; target: TreeID; parent?: TreeID; index?: number }> {
    // Build a parent-child map to determine hierarchy
    const parentMap = new Map<TreeID, TreeID>();
    const hasParentInOps = new Set<TreeID>();
    
    // Map each node to its parent and track which nodes have parents in this batch
    createOps.forEach(op => {
      if (op.parent) {
        parentMap.set(op.target, op.parent);
        hasParentInOps.add(op.target);
      }
    });
    
    // Function to calculate depth of a node in the hierarchy
    const getDepth = (nodeId: TreeID): number => {
      let depth = 0;
      let current = nodeId;
      const visited = new Set<TreeID>();
      
      while (parentMap.has(current) && !visited.has(current)) {
        visited.add(current);
        current = parentMap.get(current)!;
        depth++;
        
        // Prevent infinite loops
        if (depth > 20) {
          console.warn(`🌳 Deep hierarchy detected for ${nodeId}, breaking at depth ${depth}`);
          break;
        }
      }
      
      return depth;
    };
    
    // Sort by depth (lower depth = parents processed first)
    const sorted = createOps.sort((a, b) => {
      const depthA = getDepth(a.target);
      const depthB = getDepth(b.target);
      
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      
      // If same depth, maintain original order
      return 0;
    });
    
    console.log(`🌳 Sorted ${createOps.length} create operations by hierarchy depth`);
    return sorted;
  }
}
