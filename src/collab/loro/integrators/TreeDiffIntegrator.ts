import { 
  $getRoot, 
  $getNodeByKey, 
  $isElementNode,
  ElementNode
} from 'lexical';
import { TreeID } from 'loro-crdt';
import { BaseDiffIntegrator } from './BaseDiffIntegrator';
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
 * Simplified tree diff integrater that trusts Loro's CRDT conflict resolution
 * and applies operations directly without complex filtering or context classification
 */
export class TreeDiffIntegrator implements BaseDiffIntegrator<TreeDiff> {
  
  integrate(diff: TreeDiff, binding: Binding, provider: Provider): void {
    
    // Batch all changes in a single editor update
    binding.editor.update(() => {
      this.integrateInternal(diff, binding, provider);
    });
  }

    // Internal method that can be called when already inside editor.update()
  integrateInternal(diff: TreeDiff, binding: Binding, provider: Provider): void {
    // Sort operations: deletes first, then creates (element nodes before text), then moves
    const operations = [...diff.diff];
    operations.sort((a, b) => {
      // Delete operations first
      if (a.action === 'delete' && b.action !== 'delete') return -1;
      if (b.action === 'delete' && a.action !== 'delete') return 1;
      
      // Move operations last
      if (a.action === 'move' && b.action !== 'move') return 1;
      if (b.action === 'move' && a.action !== 'move') return -1;
      
      // For create operations, prioritize element nodes over text nodes
      if (a.action === 'create' && b.action === 'create') {
        const aNode = binding.tree.getNodeByID(a.target);
        const bNode = binding.tree.getNodeByID(b.target);
        const aIsText = aNode?.data.get('elementType') === 'text';
        const bIsText = bNode?.data.get('elementType') === 'text';
        
        if (aIsText && !bIsText) return 1;  // b (element) comes before a (text)
        if (!aIsText && bIsText) return -1; // a (element) comes before b (text)
      }
      
      return 0; // Keep original order for same priority
    });
    
    operations.forEach(operation => {
      switch (operation.action) {
        case 'create':
          this.integrateCreate(operation, binding, provider);
          break;
        case 'move':
          this.integrateMove(operation, binding, provider);
          break;
        case 'delete':
          this.integrateDelete(operation, binding, provider);
          break;
        default:
          console.warn(`🌳 Unknown tree operation: ${operation.action}`);
      }
    });
  }

  private integrateCreate(
    operation: { target: TreeID; parent?: TreeID; index?: number }, 
    binding: Binding, 
    provider: Provider
  ): void {
    try {
      let { nodeKey } = parseTreeID(operation.target);
      
      // Skip root node creation - root is integrated during initial setup
      // But ensure the root mapping exists
      // Only treat as root if it's actually a root-type node in Loro
      if (nodeKey === "0") {
        const treeNode = binding.tree.getNodeByID(operation.target);
        const elementType = treeNode?.data.get('elementType');
        if (elementType === 'root' || !elementType) {
          const root = $getRoot();
          binding.nodeMapper.setMapping(root.getKey(), operation.target);
          return;
        }
        // If nodeKey is "0" but it's not actually a root element, continue with normal processing
      }
      
      // Check if node already exists and if it's the same TreeID
      const existingNode = $getNodeByKey(nodeKey);
      if (existingNode) {
        const existingTreeID = binding.nodeMapper.getTreeIdByLexicalKey(nodeKey);
        if (existingTreeID === operation.target) {
          return;
        } else {
          // Don't reuse existing keys for different TreeIDs - let Lexical generate a fresh one
          nodeKey = undefined; // Let createLexicalNodeFromLoro generate a fresh key
        }
      }

      // Create Lexical node from Loro data
      const lexicalNode = createLexicalNodeFromLoro(
        operation.target,
        binding.tree,
        binding
      );

      if (!lexicalNode) {
        return;
      }

      // Find parent node
      let parentNode: ElementNode;
      if (operation.parent) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
        const parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
        
        if (parentLexicalNode && $isElementNode(parentLexicalNode)) {
          parentNode = parentLexicalNode;
        } else {
          // For text nodes, we MUST have a proper parent element
          if (lexicalNode.getType() === 'text') {
            return;
          }
          
          parentNode = $getRoot();
        }
      } else {
        parentNode = $getRoot();
      }

      // Normal insertion
      if (operation.index !== undefined) {
        parentNode.splice(operation.index, 0, [lexicalNode]);
      } else {
        parentNode.append(lexicalNode);
      }

      // Set up mapping
      binding.nodeMapper.setMapping(lexicalNode.getKey(), operation.target);

    } catch (error) {
      console.warn(`🌳 Error creating node for ${operation.target}:`, error);
    }
  }

  private integrateMove(
    operation: { target: TreeID; parent?: TreeID; index?: number },
    binding: Binding,
    provider: Provider
  ): void {
    try {
      const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
      if (!lexicalKey) {
        console.warn(`🌳 No Lexical key found for move target ${operation.target}`);
        return;
      }

      const nodeToMove = $getNodeByKey(lexicalKey);
      if (!nodeToMove) {
        console.warn(`🌳 Node to move not found: ${lexicalKey}`);
        return;
      }

      // Find new parent
      let newParent: ElementNode;
      if (operation.parent) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
        const parentNode = parentKey ? $getNodeByKey(parentKey) : null;
        
        if (parentNode && $isElementNode(parentNode)) {
          newParent = parentNode;
        } else {
          // For text nodes, we can't move them to root - skip this move operation
          // The node is already in the correct position from our create fix
          if (nodeToMove.getType() === 'text') {
            return;
          }
          newParent = $getRoot();
        }
      } else {
        // For text nodes without a parent, skip the move
        if (nodeToMove.getType() === 'text') {
          return;
        }
        newParent = $getRoot();
      }

      // Remove from current position and insert at new position
      nodeToMove.remove();
      
      if (operation.index !== undefined) {
        newParent.splice(operation.index, 0, [nodeToMove]);
      } else {
        newParent.append(nodeToMove);
      }

    } catch (error) {
      console.warn(`🌳 Error moving node ${operation.target}:`, error);
    }
  }

  private integrateDelete(
    operation: { target: TreeID },
    binding: Binding,
    provider: Provider
  ): void {
    try {
      const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
      if (!lexicalKey) {
        console.warn(`🌳 No Lexical key found for delete target ${operation.target}`);
        return;
      }

      const nodeToDelete = $getNodeByKey(lexicalKey);
      if (!nodeToDelete) {
        console.warn(`🌳 Node to delete not found: ${lexicalKey}`);
        return;
      }

      // Remove from Lexical tree
      nodeToDelete.remove();
      
      // Clean up mapping
      binding.nodeMapper.deleteMapping(lexicalKey);
      
    } catch (error) {
      // Handle the case where Loro is trying to delete an already deleted node
      if (error.message && error.message.includes('is deleted or does not exist')) {
        console.log(`🌳 Node ${operation.target} already deleted (normal during restructuring):`, error.message);
      } else {
        console.warn(`🌳 Error deleting node ${operation.target}:`, error);
      }
    }
  }

}