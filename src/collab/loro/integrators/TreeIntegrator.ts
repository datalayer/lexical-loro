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
  LexicalNode,
  NodeKey,
  DecoratorNode,
} from 'lexical';
import { TreeID } from 'loro-crdt';
import { BaseIntegrator } from './BaseIntegrator';
import { Binding } from '../Bindings';
import { Provider } from '../State';
import { isLiveTreeNode } from '../utils/Utils';
import { createLexicalNodeFromLoro } from '../nodes/NodeFactory';
import { invariant } from '../utils/Invariant';

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

    // Loro often splits a node's placement into a parentless `create` followed
    // by a `move` that supplies the real parent/index. Inline nodes (text,
    // linebreak) can never live at the root — not even transiently — so fold
    // the move's parent/index back into the create and drop the now-redundant
    // move. This resolves the placement up front instead of skipping the node.
    const moveByTarget = new Map<string, { action: string; target: TreeID; parent?: TreeID; index?: number }>();
    for (const mv of moves) {
      moveByTarget.set(String(mv.target), mv);
    }
    const foldedMoveTargets = new Set<string>();
    for (const cr of creates) {
      if (cr.parent === undefined) {
        const mv = moveByTarget.get(String(cr.target));
        if (mv && mv.parent !== undefined) {
          cr.parent = mv.parent;
          cr.index = mv.index;
          foldedMoveTargets.add(String(cr.target));
        }
      }
    }
    let effectiveMoves = moves.filter(mv => !foldedMoveTargets.has(String(mv.target)));

    // A create for a node the tree no longer holds is one a later transaction
    // has already undone — the seed bootstrap makes a default paragraph and
    // then replaces it, and a client that imports both in one tick integrates
    // the first batch against a tree that is already past it. There is nothing
    // to draw for such a node; reading its data throws (`NodeFactory: TreeID
    // not present`), and one throw inside the batch discards every other op in
    // it, which is where the two sides start to drift. Its children go with
    // it: they would otherwise defer forever for a parent that never arrives.
    const stale = new Set<string>();
    for (const cr of creates) {
      if (!isLiveTreeNode(binding.tree, cr.target)) {
        stale.add(String(cr.target));
      }
    }
    for (let grew = true; grew; ) {
      grew = false;
      for (const cr of creates) {
        const key = String(cr.target);
        if (!stale.has(key) && cr.parent !== undefined && stale.has(String(cr.parent))) {
          stale.add(key);
          grew = true;
        }
      }
    }
    const liveCreates = stale.size === 0
      ? creates
      : creates.filter(cr => !stale.has(String(cr.target)));
    if (stale.size > 0) {
      effectiveMoves = effectiveMoves.filter(mv => !stale.has(String(mv.target)));
    }

    // Topologically sort create operations so parents are created before children.
    // Without this, a TableCellNode may arrive before its parent TableRowNode,
    // causing the cell to fall back to $getRoot() and appear on one flat line.
    const sortedCreates = this.topologicalSortCreates(liveCreates, binding);

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
        // No progress in a full pass: every remaining node references a parent
        // that never arrived in this batch. This is a real ordering/data bug.
        // Surface it instead of dropping the nodes onto the root (or silently
        // discarding inline nodes, which would lose user content).
        invariant(
          false,
          'TreeIntegrator: create operations reference parents missing from the batch',
          {
            // Which of the two failures this is: a parent the tree does not
            // hold at all (ordering), or one it holds that this editor never
            // mapped (an earlier batch lost). And how many roots the tree has
            // — two peers each making their own is the usual way a subtree
            // ends up with a parent nobody mapped.
            pending: stillPending.map(op => ({
              target: String(op.target),
              parent: op.parent ? String(op.parent) : null,
              parentInTree: op.parent ? isLiveTreeNode(binding.tree, op.parent) : null,
              parentMapped: op.parent
                ? binding.nodeMapper.getLexicalKeyByLoroId(op.parent) ?? null
                : null,
            })),
            roots: binding.tree.roots().map(root => String(root.id)),
          },
        );
      }
      pending = stillPending;
    }

    // Phase 3: moves (those not already folded into a create above).
    effectiveMoves.forEach(op => this.integrateMove(op, binding, provider));
  }

  private integrateCreate(
    operation: { target: TreeID; parent?: TreeID; index?: number },
    binding: Binding,
    provider: Provider,
    nodeCache: Map<string, LexicalNode | null>,
  ): 'created' | 'deferred' {
    // A root is a node the diff gives no parent — not a node whose counter is
    // 0, which is merely the first node its peer made and, now that a pane
    // holds its edits until the snapshot has landed, is as likely a text node
    // as anything. The Lexical root keeps the first Loro root it was mapped
    // to; a later one (a room written before roots were adopted rather than
    // minted holds one per peer) is aliased onto it, so its subtree still
    // lands in the document.
    if (operation.parent == null) {
      const treeNode = binding.tree.getNodeByID(operation.target);
      const elementType = treeNode?.data.get('elementType');
      const lexicalType = (
        treeNode?.data.get('lexical') as unknown as {type?: string} | undefined
      )?.type;
      if (elementType === 'root' || lexicalType === 'root' || !elementType) {
        const root = $getRoot();
        const mapped = binding.nodeMapper.getTreeIDByLexicalKey(root.getKey());
        if (mapped === undefined || !isLiveTreeNode(binding.tree, mapped)) {
          binding.nodeMapper.setMapping(root.getKey(), operation.target);
          // The document has arrived. Whatever sits under the Lexical root
          // without a mapping is this pane's own placeholder — the paragraph
          // it was given to type into while the room was empty — and gives
          // way, as the pre-snapshot state did.
          for (const child of root.getChildren()) {
            if (!binding.nodeMapper.hasLexicalMapping(child.getKey())) {
              child.remove();
            }
          }
        } else if (mapped !== operation.target) {
          binding.nodeMapper.aliasLoroId(operation.target, root.getKey());
        }
        return 'created';
      }
      // No parent, yet not a root element: a stray top-level node. Fall
      // through and place it under the Lexical root.
    }

    // A create for a node this editor already holds — a diff that says a node
    // came back, or one it never let go of — is nothing to do. Making another
    // would leave the first standing, unmapped: a copy.
    const heldKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
    if (heldKey !== null && $getNodeByKey(heldKey) !== null) {
      return 'created';
    }

    // Create the Lexical node once and cache it, so deferred retries reuse
    // the same instance instead of importing duplicate nodes.
    const cacheKey = String(operation.target);
    let lexicalNode = nodeCache.get(cacheKey);
    if (lexicalNode === undefined) {
      lexicalNode = createLexicalNodeFromLoro(operation.target, binding.tree, binding);
      nodeCache.set(cacheKey, lexicalNode);
    }
    invariant(
      lexicalNode != null,
      'integrateCreate: failed to materialise Lexical node from Loro data',
      { target: cacheKey },
    );

    if (operation.parent) {
      const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
      const parentLexicalNode = parentKey ? $getNodeByKey(parentKey) : null;

      // Parent expected but not mapped yet → defer until it is created. This is
      // legitimate ordering (a later pass/batch supplies the parent), not an
      // error that hides a bug.
      if (!(parentLexicalNode && $isElementNode(parentLexicalNode))) {
        return 'deferred';
      }

      this.insertChild(parentLexicalNode, lexicalNode, operation.index);
    } else {
      // No parent → root. Only element/decorator nodes may live at the root; an
      // inline node without a parent is a structural bug, not something to skip.
      invariant(
        this.canBeRootChild(lexicalNode),
        'integrateCreate: inline node has no parent (cannot live at root)',
        { target: cacheKey, nodeType: lexicalNode.getType() },
      );
      this.insertChild($getRoot(), lexicalNode, operation.index);
    }

    binding.nodeMapper.setMapping(lexicalNode.getKey(), operation.target);
    return 'created';
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
    const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
    invariant(
      lexicalKey != null,
      'integrateMove: no Lexical key for move target',
      { target: String(operation.target) },
    );

    const nodeToMove = $getNodeByKey(lexicalKey);
    invariant(nodeToMove != null, 'integrateMove: node to move not found', { lexicalKey });

    // Resolve the new parent.
    let newParent: ElementNode;
    if (operation.parent) {
      const parentKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.parent);
      const parentNode = parentKey ? $getNodeByKey(parentKey) : null;
      invariant(
        parentNode != null && $isElementNode(parentNode),
        'integrateMove: move target parent is not a mapped element',
        { target: String(operation.target), parent: String(operation.parent) },
      );
      newParent = parentNode;
    } else {
      // No parent → root, only valid for element/decorator nodes.
      invariant(
        this.canBeRootChild(nodeToMove),
        'integrateMove: inline node cannot be moved to the root',
        { lexicalKey, nodeType: nodeToMove.getType() },
      );
      newParent = $getRoot();
    }

    // Remove from current position and insert at new position — past a
    // `remove()` override, as in `integrateDelete`, or the node is counted
    // twice while it is placed.
    nodeToMove.remove();
    if (nodeToMove.isAttached()) {
      $removeDespiteOverride(nodeToMove);
    }
    if (operation.index !== undefined) {
      newParent.splice(operation.index, 0, [nodeToMove]);
    } else {
      newParent.append(nodeToMove);
    }
  }

  private integrateDelete(
    operation: { target: TreeID },
    binding: Binding,
    provider: Provider
  ): void {
    const lexicalKey = binding.nodeMapper.getLexicalKeyByLoroId(operation.target);
    // Parent-first delete batches can make child mappings stale before their
    // own delete ops arrive. Missing mapping here is therefore benign.
    if (!lexicalKey) {
      return;
    }

    const nodeToDelete = $getNodeByKey(lexicalKey);
    // Node may already be gone due to an ancestor deletion in this same batch.
    if (!nodeToDelete) {
      binding.nodeMapper.removeMappingForKey(lexicalKey);
      return;
    }

    // The root is never deletable in Lexical; a delete resolving to it means a
    // mapping is wrong upstream — surface it rather than silently ignoring.
    if (nodeToDelete === $getRoot()) {
      return;
    }

    // Clean descendant mappings first so later child-delete ops in the same
    // batch become harmless no-ops instead of failing with stale mappings.
    const descendantKeys = this.collectDescendantKeys(nodeToDelete);
    for (const key of descendantKeys) {
      binding.nodeMapper.removeMappingForKey(key);
    }

    // Remove from the Lexical tree. A node may override `remove()` to protect
    // itself from the user's Backspace — a Jupyter output does — and stay
    // attached; the room's delete is not the user's, so it goes anyway.
    nodeToDelete.remove();
    if (nodeToDelete.isAttached()) {
      $removeDespiteOverride(nodeToDelete);
    }

    // Clean up mapping only — the Loro tree already processed this deletion
    // from the remote peer; calling tree.delete() again would throw.
    binding.nodeMapper.removeMappingForKey(lexicalKey);
  }

  private collectDescendantKeys(node: LexicalNode): NodeKey[] {
    if (!$isElementNode(node)) {
      return [];
    }

    const keys: NodeKey[] = [];
    const stack = [...node.getChildren()];
    while (stack.length > 0) {
      const current = stack.pop()!;
      keys.push(current.getKey());
      if ($isElementNode(current)) {
        stack.push(...current.getChildren());
      }
    }

    return keys;
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

/**
 * Remove a node through the base implementation, past any override.
 *
 * `LexicalNode` is exported as a type only, so its `remove` is reached through
 * a subclass that is a value and does not override it.
 */
function $removeDespiteOverride(node: LexicalNode): void {
  DecoratorNode.prototype.remove.call(node, false);
}
