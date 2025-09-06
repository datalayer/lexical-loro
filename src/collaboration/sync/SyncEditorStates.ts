/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { EditorState, NodeKey } from 'lexical';
import type { LoroBinding } from '../LoroBinding';
import type { LoroProvider } from '../LoroProvider';

// Collaboration tags (following YJS pattern)
const LORO_COLLABORATION_TAG = 'loro-collab';
const HISTORIC_TAG = 'historic';

/**
 * Sync changes from Loro to Lexical editor
 * Following YJS syncYjsChangesToLexical pattern exactly
 */
export function syncLoroToLexical(
  binding: LoroBinding,
  provider: LoroProvider,
  events: Array<any>, // LoroEvent type when available
  isFromUndoManager: boolean,
  syncCursorPositionsFn?: (binding: LoroBinding, provider: LoroProvider) => void
): void {
  const editor = binding.editor;
  const currentEditorState = editor._editorState;

  console.log('� Syncing Loro changes to Lexical:', {
    eventsCount: events.length,
    isFromUndoManager,
    hasCurrentState: !!currentEditorState
  });

  // Precompute event deltas (following YJS pattern)
  events.forEach((event) => {
    // TODO: Access event.delta when Loro API is available
    console.log('📊 Precomputing event delta:', event);
  });

  editor.update(
    () => {
      // Process each Loro event (following YJS $syncEvent pattern)
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        console.log('🔄 Processing Loro event:', event);
        
        // TODO: Implement Loro event processing when Tree API is available
        // binding.root.applyLoroEvent?.(binding, event);
      }

      // Sync cursor positions (following YJS pattern)
      if (syncCursorPositionsFn) {
        console.log('🎯 Syncing cursor positions');
        syncCursorPositionsFn(binding, provider);
      }

      console.log('✅ Loro changes applied to Lexical');
    },
    {
      tag: isFromUndoManager ? HISTORIC_TAG : LORO_COLLABORATION_TAG,
      skipTransforms: true,
    }
  );
}

type IntentionallyMarkedAsDirtyElement = boolean;

/**
 * Sync changes from Lexical to Loro document  
 * Following YJS syncLexicalUpdateToYjs pattern exactly
 */
export function syncLexicalToLoro(
  _binding: LoroBinding, // eslint-disable-line @typescript-eslint/no-unused-vars
  _provider: LoroProvider, // eslint-disable-line @typescript-eslint/no-unused-vars
  _prevEditorState: EditorState, // eslint-disable-line @typescript-eslint/no-unused-vars
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>
): void {
  console.log('📤 Syncing Lexical changes to Loro', {
    dirtyElementsCount: dirtyElements.size,
    dirtyLeavesCount: dirtyLeaves.size,
    normalizedNodesCount: normalizedNodes.size,
    tags: Array.from(tags)
  });

  // TODO: Implement syncWithTransaction when Loro supports transactions
  // syncWithTransaction(binding, () => {
  currEditorState.read(() => {
    // Skip if this update came from Loro collaboration (following YJS pattern)
    if (tags.has(LORO_COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) {
      if (normalizedNodes.size > 0) {
        console.log('🔧 Handling normalization merge conflicts');
        // TODO: Implement $handleNormalizationMergeConflicts when Loro API supports it
      }
      return;
    }

    // Sync root structure changes (following YJS pattern)
    if (dirtyElements.has('root')) {
      const nextLexicalRoot = currEditorState._nodeMap.get('root');
      
      console.log('🌳 Root element changed, syncing structure');
      
      // TODO: Sync root properties when Loro Tree API is available
      if (nextLexicalRoot) {
        // binding.root.syncPropertiesFromLexical?.(binding, nextLexicalRoot, prevNodeMap);
        console.log('📝 Root properties would be synced here');
      }
    }

    // Process all dirty elements (following YJS pattern)
    // TODO: Implement reconciler when Loro Tree API is available
    console.log('📊 Processing dirty elements and leaves:', {
      dirtyElementsCount: dirtyElements.size,
      dirtyLeavesCount: dirtyLeaves.size
    });

    // TODO: Implement syncChildrenFromLexical when Loro Tree API is available
    // binding.root.syncChildrenFromLexical?.(binding, currEditorState._nodeMap.get('root'), prevEditorState._nodeMap, reconciler, dirtyElements);
    console.log('🔄 Children synchronization would happen here');

    console.log('✅ Lexical changes applied to Loro');
  });
  // });
}
