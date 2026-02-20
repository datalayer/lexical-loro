/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
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

    // Phase 1: Process RootNode mutations
    mutatedNodes.forEach((nodeMap, Klass) => {
      if (isClassExtending(Klass, RootNode)) {
        nodeMap.forEach((mutation, nodeKey) => {
          propagateRootNode(update, mutation, nodeKey, mutatorOptions);
        });
      }
    });

    // Phase 2: Collect all ElementNode mutations, sort by depth, then propagate
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
    
    // Sort by depth ascending → parents (depth 1) are propagated before children (depth 2, 3, …)
    elementMutations.sort((a, b) => a.depth - b.depth);
    
    for (const { mutation, nodeKey } of elementMutations) {
      propagateElementNode(update, mutation, nodeKey, mutatorOptions);
    }
    
    // Phase 3: Process leaf children (their parents are now guaranteed to be mapped)
    mutatedNodes.forEach((nodeMap, Klass) => {
      if (isClassExtending(Klass, TextNode)) {
        nodeMap.forEach((mutation, nodeKey) => {
          propagateTextNode(update, mutation, nodeKey, mutatorOptions);
        });
      } else if (isClassExtending(Klass, LineBreakNode)) {
        nodeMap.forEach((mutation, nodeKey) => {
          propagateLineBreakNode(update, mutation, nodeKey, mutatorOptions);
        });
      } else if (isClassExtending(Klass, DecoratorNode)) {
        nodeMap.forEach((mutation, nodeKey) => {
          propagateDecoratorNode(update, mutation, nodeKey, mutatorOptions);
        });
      }
    });

    // Option 1 - commit directly.
    binding.doc.commit({ origin: binding.doc.peerIdStr });

    // Option 2 - Schedule an async commit instead of immediate synchronous commit.
    // This reduces latency for large documents by debouncing commits.
    // scheduleAsyncCommit(binding);

    // Option 3 - Schedule an async commit instead of immediate synchronous commit.
    // This reduces latency for large documents by debouncing commits.
    /*
    const doCommit = () => requestIdleCallback(() => {
       binding.doc.commit({ origin: binding.doc.peerIdStr });
    }, { timeout: 2000 });
    doCommit();
    */
    currEditorState.read(() => {
      const selection = $getSelection();
      const prevSelection = prevEditorState._selection;
      syncLexicalSelectionToLoro(binding, provider, prevSelection, selection);
    });

  }
}
