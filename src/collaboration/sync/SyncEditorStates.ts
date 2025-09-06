/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroBinding } from '../LoroBinding';
import type { LoroProvider } from '../LoroProvider';

/**
 * Sync changes from Loro to Lexical editor
 * This is the key function that prevents full editor state replacement
 */
export function syncLoroToLexical(
  binding: LoroBinding,
  provider: LoroProvider,
  events: any[], // Loro events
  isFromUndoManager: boolean = false
): void {
  const { editor, root } = binding;

  console.log('🔄 Syncing Loro changes to Lexical:', events.length, 'events');

  // Use editor.update to apply changes without full state replacement
  editor.update(
    () => {
      // Process each Loro event and apply incremental changes
      for (const event of events) {
        // TODO: Implement event processing logic
        // This should parse Loro events and apply them as incremental updates
        console.log('📝 Processing Loro event:', event);
        
        // Apply changes to the collaboration tree
        root.applyLoroDeltas(binding, [event]);
      }

      // Sync the collaboration tree with Lexical nodes
      root.syncChildrenFromLoro(binding);
    },
    {
      // Use collaboration tag to identify updates from remote clients
      tag: isFromUndoManager ? 'historic' : 'collaboration',
      skipTransforms: true, // Skip transforms to preserve exact changes
    }
  );
}

/**
 * Sync changes from Lexical to Loro document
 */
export function syncLexicalToLoro(
  binding: LoroBinding,
  provider: LoroProvider,
  prevEditorState: any,
  editorState: any,
  dirtyElements: Set<string>,
  dirtyLeaves: Set<string>,
  normalizedNodes: Set<string>,
  tags: Set<string>
): void {
  console.log('🔄 Syncing Lexical changes to Loro');

  // Skip if this update came from collaboration (avoid infinite loops)
  if (tags.has('collaboration') || tags.has('historic')) {
    console.log('⏭️ Skipping sync - update from collaboration');
    return;
  }

  // TODO: Implement Lexical to Loro synchronization
  // This should:
  // 1. Analyze dirty elements and leaves
  // 2. Generate Loro operations
  // 3. Apply them to the Loro document
  // 4. Send updates to other clients via provider

  console.log('📤 Dirty elements:', dirtyElements.size);
  console.log('📤 Dirty leaves:', dirtyLeaves.size);
  console.log('📤 Normalized nodes:', normalizedNodes.size);
}
