import { 
  $getRoot, 
  $getNodeByKey, 
  $isElementNode,
  ElementNode
} from 'lexical';
import { TreeID } from 'loro-crdt';
import { BaseIntegrator } from './BaseIntegrator';
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
export class TreeIntegrator implements BaseIntegrator<TreeDiff> {
  
  integrate(diff: TreeDiff, binding: Binding, provider: Provider): void {
    
    // Batch all changes in a single editor update
    binding.editor.update(() => {
      this.integrateInternal(diff, binding, provider);
    });
  }

    // Internal method that can be called when already inside editor.update()
  integrateInternal(diff: TreeDiff, binding: Binding, provider: Provider): void {
    // Separate operations by action type
    const deletes: Array<{ action: string; target: TreeID; parent?: TreeID; index?: number }> = [];
    const creates: Array<{ action: string; target: TreeID; parent?: TreeID; index?: number }> = [];
    const moves: Array<{ action: string; target: TreeID; parent?: TreeID; index?: number }> = [];

    for (const op of diff.diff) {
      switch (op.action) {
        case 'delete': deletes.push(op); break;
        case 'create': creates.push(op); break;
        case 'move':   moves.push(op);   break;
      }
    }

    // Topologically sort create operations so parents are created before children.
    // Without this, a TableCellNode may arrive before its parent TableRowNode,
    // causing the cell to fall back to $getRoot() and appear on one flat line.
    const sortedCreates = this.topologicalSortCreates(creates, binding);

    // Execute: deletes → creates (parent-first) → moves
    const operations = [...deletes, ...sortedCreates, ...moves];
    
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
        const existingTreeID = binding.nodeMapper.getTreeIDByLexicalKey(nodeKey);
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
          console.warn(`🌳 Parent NOT found for ${lexicalNode.getType()} target=${operation.target} parent=${operation.parent} parentKey=${parentKey} parentFound=${!!parentLexicalNode} isElement=${parentLexicalNode ? $isElementNode(parentLexicalNode) : 'N/A'}`);
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
      
      // Clean up mapping only — do NOT call deleteMapping() here because
      // the Loro tree has already processed this deletion from the remote
      // peer.  Calling tree.delete() again would throw "is deleted or does
      // not exist".
      binding.nodeMapper.removeMappingForKey(lexicalKey);
      
    } catch (error) {
      console.warn(`🌳 Error deleting node ${operation.target}:`, error);
    }
  }

  /**
   * Topologically sort create operations so that parent nodes are created
   * before their children.
   *
   * Computes depth using the `parent` field from the diff operations
   * themselves rather than querying the Loro tree API (which may behave
   * unexpectedly during event processing).  For each create op, we count
   * how many of its ancestors are also being created in this same batch.
   * Ties at the same depth preserve the original diff order (stable sort).
   */
  private topologicalSortCreates(
    creates: Array<{ action: string; target: TreeID; parent?: TreeID; index?: number }>,
    binding: Binding,
  ): Array<{ action: string; target: TreeID; parent?: TreeID; index?: number }> {
    if (creates.length <= 1) return creates;

    // Build lookup: target → parent (only for operations in this batch)
    const batchTargets = new Set<string>(creates.map(op => String(op.target)));
    const parentOf = new Map<string, string>();
    for (const op of creates) {
      if (op.parent) {
        parentOf.set(String(op.target), String(op.parent));
      }
    }

    const depthCache = new Map<string, number>();

    const getDepth = (targetStr: string): number => {
      if (depthCache.has(targetStr)) return depthCache.get(targetStr)!;

      let depth = 0;
      let current = targetStr;
      const visited = new Set<string>();

      // Walk up the parent chain; count only ancestors that are also being
      // created in this batch (i.e. don't exist yet and must come first).
      while (parentOf.has(current)) {
        const parent = parentOf.get(current)!;
        if (visited.has(parent)) break; // cycle guard
        visited.add(parent);

        if (batchTargets.has(parent)) {
          depth++;
          current = parent;
        } else {
          break; // parent already exists locally — stop counting
        }
      }

      depthCache.set(targetStr, depth);
      return depth;
    };

    // Tag each operation with its original index (for stable tie-breaking)
    const tagged = creates.map((op, i) => ({ op, depth: getDepth(String(op.target)), idx: i }));
    tagged.sort((a, b) => a.depth - b.depth || a.idx - b.idx);

    return tagged.map(t => t.op);
  }

}