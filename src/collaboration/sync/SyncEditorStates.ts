/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { EditorState, NodeKey } from 'lexical';
import { $getRoot } from 'lexical';
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

/**
 * Sync changes from Lexical to Loro document  
 * Following YJS syncLexicalUpdateToYjs pattern exactly
 */
type IntentionallyMarkedAsDirtyElement = boolean;

export function syncLexicalToLoro(
  _binding: LoroBinding,
  _provider: LoroProvider,
  _prevEditorState: EditorState,
  currEditorState: EditorState,
  dirtyElements: Map<NodeKey, IntentionallyMarkedAsDirtyElement>,
  dirtyLeaves: Set<NodeKey>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>
): void {
  // Debug: Log the actual types to understand what Lexical provides
  console.log('🔍 Parameter types:', {
    dirtyElements: dirtyElements.constructor.name,
    dirtyLeaves: dirtyLeaves.constructor.name,
    normalizedNodes: normalizedNodes.constructor.name,
    tags: tags.constructor.name
  });
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
      const nextLexicalRoot = $getRoot();
      
      console.log('🌳 Root element changed, syncing structure');
      
      // Sync root properties and children to Loro
      // This follows the exact YJS pattern: syncPropertiesFromLexical then syncChildrenFromLexical
      try {
        // Get the current root state as JSON for comparison
        const rootChildren = nextLexicalRoot.getChildren();
        console.log('📝 Root has', rootChildren.length, 'children');
        
        // For now, store the entire editor state as a simple document update
        // This is a simplified approach until we implement proper tree sync
        const editorStateJson = JSON.stringify(nextLexicalRoot.exportJSON());
        
        // Store in Loro's text container for simplicity
        const text = _binding.doc.getText('editor');
        
        // Clear existing content and insert new content
        // This is a simplified sync - in a full implementation we'd do proper diffing
        try {
          const currentLength = text.length;
          if (currentLength > 0) {
            text.delete(0, currentLength);
          }
        } catch {
          // Text might be empty, that's fine
        }
        
        // Insert the serialized content
        if (editorStateJson.length > 0) {
          text.insert(0, editorStateJson);
          console.log('📝 Synced root state to Loro text container');
        }
        
      } catch (error) {
        console.warn('⚠️ Failed to sync root structure:', error);
      }
    }

    // Process other dirty elements and leaves (following YJS pattern)
    if (dirtyElements.size > 1 || dirtyLeaves.size > 0) {
      console.log('📊 Processing additional dirty elements and leaves:', {
        dirtyElementsCount: dirtyElements.size,
        dirtyLeavesCount: dirtyLeaves.size
      });
      
      // For now, we handle these as part of the root sync above
      // In a full implementation, we'd iterate through each dirty element
      // and sync it individually using the Loro Tree API
    }

    // Export and send the document state changes
    try {
      // Export the current document state as an update
      const exportedUpdate = _binding.doc.export({ mode: 'update' });
      const browserId = _provider.clientId.slice(-4);
      console.log(`📦 [CLIENT-${browserId}] Exported Loro update:`, exportedUpdate.length, 'bytes');
      
      // Send the update via the provider (if there are actual changes)
      if (exportedUpdate.length > 0) {
        const timestamp = new Date().toISOString();
        const browserId = _provider.clientId.slice(-4); // Use last 4 chars of client ID
        console.log(`📤 [CLIENT-${browserId}] Sending update to server at ${timestamp}:`, {
          updateSize: exportedUpdate.length,
          updatePreview: Array.from(exportedUpdate.slice(0, 10)),
          dirtyElementsCount: dirtyElements.size,
          dirtyLeavesCount: dirtyLeaves.size
        });
        _provider.sendUpdate(exportedUpdate);
        console.log(`✅ [CLIENT-${browserId}] Update sent successfully`);
      } else {
        const browserId = _provider.clientId.slice(-4);
        console.log(`⏭️ [CLIENT-${browserId}] No changes to send (empty update)`);
      }
    } catch (error) {
      const browserId = _provider.clientId.slice(-4);
      console.error(`❌ [CLIENT-${browserId}] Failed to export/send update:`, error);
    }

    console.log('✅ Lexical changes applied to Loro');
  });
  // });
}
