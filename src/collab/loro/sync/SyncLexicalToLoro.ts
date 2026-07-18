/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { UpdateListenerPayload, RootNode, ElementNode, TextNode, LineBreakNode, DecoratorNode, $getSelection, $getNodeByKey, $isElementNode } from 'lexical';
import { Binding } from '../Bindings';
import { propagateRootNode } from '../propagators/RootNodePropagator';
import { propagateLineBreakNode } from '../propagators/LineBreakNodePropagator';
import { propagateElementNode } from '../propagators/ElementNodePropagator';
import { propagateTextNode } from '../propagators/TextNodePropagator';
import { propagateDecoratorNode } from '../propagators/DecoratorNodePropagator';
import { isClassExtending, generateClientID } from '../utils/Utils';
import { syncLexicalSelectionToLoro } from './SyncCursors';
import { Provider } from '../State';
// import { scheduleAsyncCommit } from '../Bindings';
// import { syncCursorPositions, SyncCursorPositionsFn } from './SyncCursors';

export function syncLexicalToLoro(
  binding: Binding,
  provider: Provider,
  update: UpdateListenerPayload,
) {
  const {
    mutatedNodes,
    prevEditorState,
    editorState: currEditorState,
  } = update;

  // Process node mutations if present.
  // NOTE: mutatedNodes is null for selection-only updates (no DOM mutations).
  // See Lexical docs: "Will be null if no DOM was mutated, such as when only
  // the selection changed."
  if (mutatedNodes) {

    const tree = binding.tree;

    // Ensure we have a numeric peerId for TreeID format
    const peerId = generateClientID(binding.doc);

    // Create options object for mutators
    const mutatorOptions = {
      binding,
      tree,
      peerId
    };

    // Process mutations in proper dependency order:
    // 1. RootNode first
    // 2. ElementNodes sorted by tree depth (parents before children)
    // 3. TextNodes, LineBreakNodes, DecoratorNodes (leaf children)
    //
    // Depth sorting is critical: when a table is inserted, the mutations for
    // table, tablerow, tablecell, and paragraph-inside-cell ALL fire in the
    // same update. Without sorting, a tablecell may be propagated before its
    // parent tablerow — causing `getTreeIDByLexicalKey(parent)` to return
    // undefined and the cell to be created at the Loro tree root.

    // Check if any nodes actually mutated (Map could be empty for selection-only changes)
    let hasMutations = false;
    mutatedNodes.forEach((nodeMap) => {
      if (nodeMap.size > 0) hasMutations = true;
    });

    if (hasMutations) {
      // Phase 1: Process RootNode mutations
      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, RootNode)) {
          nodeMap.forEach((mutation, nodeKey) => {
            propagateRootNode(update, mutation, nodeKey, mutatorOptions);
          });
        }
      });

      // Phase 2: Collect all ElementNode mutations.
      // Apply destroys deepest-first, then creates/updates parent-first.
      const elementMutations: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string; depth: number }> = [];
      
      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, ElementNode) && !isClassExtending(Klass, RootNode)) {
          nodeMap.forEach((mutation, nodeKey) => {
            // Compute depth in Lexical tree (root=0, paragraph=1, tablecell=3, etc.)
            let depth = 0;
            currEditorState.read(() => {
              const node = $getNodeByKey(nodeKey);
              if (node) {
                let current = node.getParent();
                while (current) {
                  depth++;
                  current = current.getParent();
                }
              }
            });
            elementMutations.push({ mutation, nodeKey, depth });
          });
        }
      });
      
      const elementDestroyed = elementMutations
        .filter(m => m.mutation === 'destroyed')
        .sort((a, b) => b.depth - a.depth); // children first

      const elementCreated = elementMutations
        .filter(m => m.mutation === 'created')
        .sort((a, b) => a.depth - b.depth); // parents first

      const elementUpdated = elementMutations
        .filter(m => m.mutation === 'updated')
        .sort((a, b) => a.depth - b.depth); // parents first, after creates

      for (const { mutation, nodeKey } of [...elementDestroyed, ...elementCreated, ...elementUpdated]) {
        propagateElementNode(update, mutation, nodeKey, mutatorOptions);
      }
      
      // Phase 3: Process leaf children.
      // Apply destroys first to avoid re-create/update races during bulk deletes.
      const textDestroyed: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];
      const textCreateOrUpdate: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];
      const lineBreakDestroyed: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];
      const lineBreakCreateOrUpdate: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];
      const decoratorDestroyed: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];
      const decoratorCreateOrUpdate: Array<{ mutation: 'created' | 'updated' | 'destroyed'; nodeKey: string }> = [];

      mutatedNodes.forEach((nodeMap, Klass) => {
        if (isClassExtending(Klass, TextNode)) {
          nodeMap.forEach((mutation, nodeKey) => {
            if (mutation === 'destroyed') {
              textDestroyed.push({ mutation, nodeKey });
            } else {
              textCreateOrUpdate.push({ mutation, nodeKey });
            }
          });
        } else if (isClassExtending(Klass, LineBreakNode)) {
          nodeMap.forEach((mutation, nodeKey) => {
            if (mutation === 'destroyed') {
              lineBreakDestroyed.push({ mutation, nodeKey });
            } else {
              lineBreakCreateOrUpdate.push({ mutation, nodeKey });
            }
          });
        } else if (isClassExtending(Klass, DecoratorNode)) {
          nodeMap.forEach((mutation, nodeKey) => {
            if (mutation === 'destroyed') {
              decoratorDestroyed.push({ mutation, nodeKey });
            } else {
              decoratorCreateOrUpdate.push({ mutation, nodeKey });
            }
          });
        }
      });

      for (const { mutation, nodeKey } of textDestroyed) {
        propagateTextNode(update, mutation, nodeKey, mutatorOptions);
      }
      for (const { mutation, nodeKey } of lineBreakDestroyed) {
        propagateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
      }
      for (const { mutation, nodeKey } of decoratorDestroyed) {
        propagateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
      }
      for (const { mutation, nodeKey } of textCreateOrUpdate) {
        propagateTextNode(update, mutation, nodeKey, mutatorOptions);
      }
      for (const { mutation, nodeKey } of lineBreakCreateOrUpdate) {
        propagateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
      }
      for (const { mutation, nodeKey } of decoratorCreateOrUpdate) {
        propagateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
      }

      // Commit only when there were actual node mutations (not selection-only changes)
      binding.doc.commit({ origin: binding.doc.peerIdStr });
    }
  }

  // Always sync selection/cursor state — even for selection-only changes
  // (e.g. user clicks or drags to select text without editing).
  // This MUST be outside the `if (mutatedNodes)` block because Lexical sets
  // mutatedNodes to null when only the selection changed (no DOM mutations).
  currEditorState.read(() => {
    const selection = $getSelection();
    const prevSelection = prevEditorState._selection;
    syncLexicalSelectionToLoro(binding, provider, prevSelection, selection);
  });
}
