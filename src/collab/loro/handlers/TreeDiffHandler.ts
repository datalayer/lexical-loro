import { 
  $getRoot, 
  $getNodeByKey, 
  $isRootNode,
  $isElementNode,
  LexicalNode,
  ElementNode
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
 * Simplified tree diff handler that trusts Loro's CRDT conflict resolution
 * and applies operations directly without complex filtering or context classification
 */
export class TreeDiffHandler implements BaseDiffHandler<TreeDiff> {
  
  handle(diff: TreeDiff, binding: Binding, provider: Provider): void {
    console.log('🌳 Handling TreeDiff:', diff);
    
    // Batch all changes in a single editor update
    binding.editor.update(() => {
      this.handleInternal(diff, binding, provider);
    });
  }

    // Internal method that can be called when already inside editor.update()
  handleInternal(diff: TreeDiff, binding: Binding, provider: Provider): void {
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
    
    console.log(`🌳 Processing ${operations.length} operations in dependency order`);
    operations.forEach((op, index) => {
      console.log(`🌳 Operation ${index + 1}: ${op.action} ${op.target} (parent: ${op.parent})`);
    });
    
    operations.forEach(operation => {
      switch (operation.action) {
        case 'create':
          this.handleCreate(operation, binding, provider);
          break;
        case 'move':
          this.handleMove(operation, binding, provider);
          break;
        case 'delete':
          this.handleDelete(operation, binding, provider);
          break;
        default:
          console.warn(`🌳 Unknown tree operation: ${operation.action}`);
      }
    });
  }

  private handleCreate(
    operation: { target: TreeID; parent?: TreeID; index?: number }, 
    binding: Binding, 
    provider: Provider
  ): void {
    try {
      let { nodeKey } = parseTreeID(operation.target);
      
      // Skip root node creation - root is handled during initial setup
      // But ensure the root mapping exists
      if (nodeKey === "0") {
        const root = $getRoot();
        binding.nodeMapper.setMapping(root.getKey(), operation.target);
        console.log(`🌳 Skipping root node creation but ensured root mapping: ${root.getKey()} → ${operation.target}`);
        return;
      }
      
      // Check if node already exists and if it's the same TreeID
      const existingNode = $getNodeByKey(nodeKey);
      if (existingNode) {
        const existingTreeID = binding.nodeMapper.getTreeIdByLexicalKey(nodeKey);
        if (existingTreeID === operation.target) {
          console.log(`🌳 Node ${nodeKey} already exists for same TreeID, preserving`);
          return;
        } else {
          console.log(`🌳 Key collision: ${nodeKey} exists for TreeID ${existingTreeID}, but creating for ${operation.target}`);
          // Don't reuse existing keys for different TreeIDs - let Lexical generate a fresh one
          nodeKey = undefined; // Let createLexicalNodeFromLoro generate a fresh key
          console.log(`🌳 Will generate fresh key for TreeID: ${operation.target}`);
        }
      }

      // Create Lexical node from Loro data
      console.log(`🌳 Creating Lexical node for TreeID: ${operation.target}, NodeKey: ${nodeKey}`);
      const lexicalNode = createLexicalNodeFromLoro(
        operation.target,
        binding.tree,
        binding
      );

      if (!lexicalNode) {
        console.warn(`🌳 Failed to create Lexical node for ${operation.target}`);
        return;
      }

      console.log(`🌳 Successfully created Lexical node: ${lexicalNode.getKey()} (type: ${lexicalNode.getType()}) for TreeID: ${operation.target}`);
      console.log(`🌳 Operation details - parent: ${operation.parent}, index: ${operation.index}`);

      // Find parent node
      let parentNode: ElementNode;
      if (operation.parent) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
        const parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;
        
        console.log(`🌳 Parent lookup - TreeID: ${operation.parent} → LexicalKey: ${parentKey} → Node: ${parentLexicalNode?.getType()}`);
        console.log(`🌳 DEBUG: Current node type: ${lexicalNode.getType()}, parent type: ${parentLexicalNode?.getType()}`);
        
        if (parentLexicalNode && $isElementNode(parentLexicalNode)) {
          parentNode = parentLexicalNode;
          console.log(`🌳 Using parent node: ${parentNode.getKey()} (${parentNode.getType()})`);
        } else {
          // If the expected parent is not an element node, this is likely a mapping issue
          if (parentLexicalNode) {
            console.error(`🌳 MAPPING ERROR: Parent ${operation.parent} maps to ${parentLexicalNode.getType()} instead of element!`);
          } else {
            console.error(`🌳 MISSING PARENT: Parent ${operation.parent} not found in mapping`);
          }
          
          // For text nodes, we MUST have a proper parent element
          if (lexicalNode.getType() === 'text') {
            console.error(`🌳 SKIPPING: Cannot insert text node without proper parent element`);
            return;
          }
          
          parentNode = $getRoot();
          console.log(`🌳 Using root as fallback parent`);
        }
      } else {
        parentNode = $getRoot();
        console.log(`🌳 No parent specified, using root`);
        console.log(`🌳 WARNING: About to insert ${lexicalNode.getType()} into root - this may fail!`);
      }

      // Insert the node
      if (operation.index !== undefined) {
        console.log(`🌳 Inserting ${lexicalNode.getKey()} at index ${operation.index} in parent ${parentNode.getKey()}`);
        parentNode.splice(operation.index, 0, [lexicalNode]);
      } else {
        console.log(`🌳 Appending ${lexicalNode.getKey()} to parent ${parentNode.getKey()}`);
        parentNode.append(lexicalNode);
      }

      // Set up mapping
      console.log(`🌳 Setting up mapping: ${lexicalNode.getKey()} ↔ ${operation.target}`);
      binding.nodeMapper.setMapping(lexicalNode.getKey(), operation.target);
      
      // Verify mapping was set correctly
      const verifyKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
      console.log(`🌳 Mapping verification: TreeID ${operation.target} → ${verifyKey} (expected: ${lexicalNode.getKey()})`);
      
      console.log(`🌳 Created node ${lexicalNode.getKey()} for ${operation.target}`);
      
    } catch (error) {
      console.error(`🌳 Error creating node for ${operation.target}:`, error);
    }
  }

  private handleMove(
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
          newParent = $getRoot();
        }
      } else {
        newParent = $getRoot();
      }

      // Remove from current position and insert at new position
      nodeToMove.remove();
      
      if (operation.index !== undefined) {
        newParent.splice(operation.index, 0, [nodeToMove]);
      } else {
        newParent.append(nodeToMove);
      }

      console.log(`🌳 Moved node ${lexicalKey} to new position`);
      
    } catch (error) {
      console.error(`🌳 Error moving node ${operation.target}:`, error);
    }
  }

  private handleDelete(
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
      
      console.log(`🌳 Deleted node ${lexicalKey} for ${operation.target}`);
      
    } catch (error) {
      // Handle the case where Loro is trying to delete an already deleted node
      if (error.message && error.message.includes('is deleted or does not exist')) {
        console.log(`🌳 Node ${operation.target} already deleted (normal during restructuring):`, error.message);
      } else {
        console.error(`🌳 Error deleting node ${operation.target}:`, error);
      }
    }
  }

}