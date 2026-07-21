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

  let __seedDebugMutationCount = 0;
  if (mutatedNodes) {
    mutatedNodes.forEach((nodeMap) => {
      __seedDebugMutationCount += nodeMap.size;
    });
  }
  console.log(
    '[SEED-DEBUG] syncLexicalToLoro: mutatedNodes=',
    mutatedNodes ? 'map' : 'null',
    'totalMutations=',
    __seedDebugMutationCount,
    'tags=',
    Array.from(update.tags),
  );

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

      // Phases 2 & 3 (unified): collect every non-root mutation with its Lexical
      // tree depth AND its sibling index within its parent, then apply them in a
      // single ordered pass.
      //
      // Ordering rationale — the Loro tree requires each inserted child's index
      // to be <= its parent's current children count. Two guarantees make every
      // insertion valid:
      //   1. depth ascending  → a parent is always created before its children.
      //   2. index ascending  → a node's lower-indexed siblings are created
      //      before it, so by the time it is inserted the parent already holds
      //      exactly `index` children.
      // Crucially, elements and leaves are ordered TOGETHER. Previously all
      // ElementNodes were created before any TextNode, so a paragraph that
      // interleaves text with an inline element (e.g. a link at index 11) tried
      // to insert the link while the paragraph still had 0 children in Loro,
      // throwing "insertion index out of range". Mixing both node categories in
      // one index-sorted pass fixes that.
      type NodeCategory = 'element' | 'text' | 'linebreak' | 'decorator';
      interface MutationInfo {
        mutation: 'created' | 'updated' | 'destroyed';
        nodeKey: string;
        depth: number;
        index: number;
        category: NodeCategory;
      }

      const collected: MutationInfo[] = [];

      mutatedNodes.forEach((nodeMap, Klass) => {
        let category: NodeCategory | null = null;
        if (isClassExtending(Klass, RootNode)) {
          return; // handled in Phase 1
        } else if (isClassExtending(Klass, ElementNode)) {
          category = 'element';
        } else if (isClassExtending(Klass, TextNode)) {
          category = 'text';
        } else if (isClassExtending(Klass, LineBreakNode)) {
          category = 'linebreak';
        } else if (isClassExtending(Klass, DecoratorNode)) {
          category = 'decorator';
        }
        if (category === null) {
          return;
        }
        const resolvedCategory = category;
        nodeMap.forEach((mutation, nodeKey) => {
          // Compute depth (root=0, paragraph=1, inline element=2, …) and the
          // node's index within its parent from the current editor state.
          let depth = 0;
          let index = 0;
          currEditorState.read(() => {
            const node = $getNodeByKey(nodeKey);
            if (node) {
              index = node.getIndexWithinParent();
              let current = node.getParent();
              while (current) {
                depth++;
                current = current.getParent();
              }
            }
          });
          collected.push({ mutation, nodeKey, depth, index, category: resolvedCategory });
        });
      });

      const dispatch = (info: MutationInfo) => {
        switch (info.category) {
          case 'element':
            propagateElementNode(update, info.mutation, info.nodeKey, mutatorOptions);
            break;
          case 'text':
            propagateTextNode(update, info.mutation, info.nodeKey, mutatorOptions);
            break;
          case 'linebreak':
            propagateLineBreakNode(update, info.mutation, info.nodeKey, mutatorOptions);
            break;
          case 'decorator':
            propagateDecoratorNode(update, info.mutation, info.nodeKey, mutatorOptions);
            break;
        }
      };

      // Destroys first, deepest-first (children before parents), to avoid
      // re-create/update races during bulk deletes.
      collected
        .filter(m => m.mutation === 'destroyed')
        .sort((a, b) => b.depth - a.depth)
        .forEach(dispatch);

      // Creates next, shallow-first then ascending sibling index (see rationale
      // above) so every Loro insertion index stays within range.
      collected
        .filter(m => m.mutation === 'created')
        .sort((a, b) => a.depth - b.depth || a.index - b.index)
        .forEach(dispatch);

      // Updates last, parents-first for determinism. Updates never call
      // createLoroNode (the mapping already exists) so their order is not
      // index-sensitive.
      collected
        .filter(m => m.mutation === 'updated')
        .sort((a, b) => a.depth - b.depth || a.index - b.index)
        .forEach(dispatch);

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
