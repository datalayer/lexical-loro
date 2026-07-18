/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { 
  $getRoot, 
  $getNodeByKey, 
  $isElementNode,
  $isDecoratorNode,
  ElementNode,
  LexicalNode
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

    // Phase 1: deletes.
    deletes.forEach(op => this.integrateDelete(op, binding, provider));

    // Phase 2: creates (parent-first, with deferral).
    //
    // Topological sort orders parents before children *within this batch*, but
    // a child may still reference a parent whose Lexical mapping is not yet
    // established (deeply nested tables, list items inside quotes, Jupyter
    // cells, …). Rather than dropping such a node onto the root — which throws
    // for inline nodes like text/linebreak ("Only element or decorator nodes
    // can be inserted to the root node") and corrupts the document — we defer
    // it and retry until a full pass makes no further progress.
    //
    // Created Lexical nodes are cached so deferred retries reuse the same
    // instance instead of importing (and registering) duplicate nodes.
    const nodeCache = new Map<string, LexicalNode | null>();
    let pending = sortedCreates;
    while (pending.length > 0) {
      const stillPending: typeof pending = [];
      for (const op of pending) {
        if (this.integrateCreate(op, binding, provider, nodeCache) === 'deferred') {
          stillPending.push(op);
        }
      }
      if (stillPending.length === pending.length) {
        // No progress in a full pass: the remaining parents genuinely never
        // arrived in this batch. Attach what we safely can to the root.
        stillPending.forEach(op => this.integrateCreateOrphan(op, binding, nodeCache));
        break;
      }
      pending = stillPending;
    }

    // Phase 3: moves.
    moves.forEach(op => this.integrateMove(op, binding, provider));
  }

  private integrateCreate(
    operation: { target: TreeID; parent?: TreeID; index?: number },
    binding: Binding,
    provider: Provider,
    nodeCache: Map<string, LexicalNode | null>,
  ): 'created' | 'deferred' | 'skipped' {
    try {
      let { nodeKey } = parseTreeID(operation.target);

      // Skip root node creation - root is integrated during initial setup.
      // Only treat as root if it's actually a root-type node in Loro.
      if (nodeKey === "0") {
        const treeNode = binding.tree.getNodeByID(operation.target);
        const elementType = treeNode?.data.get('elementType');
        if (elementType === 'root' || !elementType) {
          const root = $getRoot();
          binding.nodeMapper.setMapping(root.getKey(), operation.target);
          return 'created';
        }
        // nodeKey is "0" but not an actual root element — fall through.
      }

      // Node already exists with the same TreeID → nothing to do.
      const existingNode = $getNodeByKey(nodeKey);
      if (existingNode) {
        const existingTreeID = binding.nodeMapper.getTreeIDByLexicalKey(nodeKey);
        if (existingTreeID === operation.target) {
          return 'created';
        }
        // Different TreeID reuses this key — let Lexical assign a fresh one.
        nodeKey = undefined;
      }

      // Create the Lexical node once and cache it, so deferred retries reuse
      // the same instance instead of importing duplicate nodes.
      const cacheKey = String(operation.target);
      let lexicalNode = nodeCache.get(cacheKey);
      if (lexicalNode === undefined) {
        lexicalNode = createLexicalNodeFromLoro(operation.target, binding.tree, binding);
        nodeCache.set(cacheKey, lexicalNode);
      }
      if (!lexicalNode) {
        return 'skipped';
      }

      if (operation.parent) {
        const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
        const parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;

        // Parent expected but not mapped yet → defer until it is created.
        if (!(parentLexicalNode && $isElementNode(parentLexicalNode))) {
          return 'deferred';
        }

        this.insertChild(parentLexicalNode, lexicalNode, operation.index);
      } else {
        // No parent → root. Only element/decorator nodes are valid root children;
        // inline nodes without a parent would throw, so skip them here.
        if (!this.canBeRootChild(lexicalNode)) {
          return 'skipped';
        }
        this.insertChild($getRoot(), lexicalNode, operation.index);
      }

      binding.nodeMapper.setMapping(lexicalNode.getKey(), operation.target);
      return 'created';

    } catch (error) {
      console.warn(`🌳 Error creating node for ${operation.target}:`, error);
      return 'skipped';
    }
  }

  /**
   * Last-resort handling for create operations whose parent never materialised
   * within the batch. Element and decorator nodes are attached to the root so
   * their content stays visible; inline nodes (text, linebreak, …) cannot live
   * at the root and are dropped — they will re-sync once their parent arrives
   * in a later event batch.
   */
  private integrateCreateOrphan(
    operation: { target: TreeID; parent?: TreeID; index?: number },
    binding: Binding,
    nodeCache: Map<string, LexicalNode | null>,
  ): void {
    try {
      const cacheKey = String(operation.target);
      let lexicalNode = nodeCache.get(cacheKey);
      if (lexicalNode === undefined) {
        lexicalNode = createLexicalNodeFromLoro(operation.target, binding.tree, binding);
        nodeCache.set(cacheKey, lexicalNode);
      }
      if (!lexicalNode) {
        return;
      }

      if (!this.canBeRootChild(lexicalNode)) {
        console.warn(
          `🌳 Dropping orphan inline node ${operation.target} (${lexicalNode.getType()}): parent ${operation.parent} never resolved in this batch`,
        );
        return;
      }

      this.insertChild($getRoot(), lexicalNode, operation.index);
      binding.nodeMapper.setMapping(lexicalNode.getKey(), operation.target);
    } catch (error) {
      console.warn(`🌳 Error creating orphan node ${operation.target}:`, error);
    }
  }

  /** Only element and decorator nodes may be inserted directly under the root. */
  private canBeRootChild(node: LexicalNode): boolean {
    return $isElementNode(node) || $isDecoratorNode(node);
  }

  /** Insert a child into a parent element at an optional index. */
  private insertChild(parent: ElementNode, child: LexicalNode, index?: number): void {
    if (index !== undefined) {
      parent.splice(index, 0, [child]);
    } else {
      parent.append(child);
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
          // Can't relocate to root unless it's an element/decorator node.
          // Inline nodes (text, linebreak, …) stay where they are.
          if (!this.canBeRootChild(nodeToMove)) {
            return;
          }
          newParent = $getRoot();
        }
      } else {
        // No parent → root, only valid for element/decorator nodes.
        if (!this.canBeRootChild(nodeToMove)) {
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

      // Root nodes are never deletable in Lexical. In rare races a remote
      // delete operation may transiently resolve to the local root mapping;
      // ignore it to keep integration resilient.
      if (nodeToDelete === $getRoot()) {
        console.warn(
          `🌳 Skipping invalid root delete operation for target ${operation.target}`,
        );
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