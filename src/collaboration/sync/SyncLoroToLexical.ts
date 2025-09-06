/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { EditorState } from 'lexical';
import type { LoroBinding } from '../LoroBinding';
import { 
  $getRoot, 
  $createParagraphNode, 
  $createTextNode,
  $addUpdateTag,
  $getSelection,
  SKIP_SCROLL_INTO_VIEW_TAG
} from 'lexical';

// Collaboration tags (following YJS pattern)
const LORO_COLLABORATION_TAG = 'loro-collaboration';
const LORO_HISTORIC_TAG = 'loro-historic';

/**
 * Sync Loro Tree changes to Lexical editor (equivalent to YJS syncYjsChangesToLexical)
 * 
 * This function handles incoming changes from the Loro document and applies them
 * to the Lexical editor incrementally, following the YJS pattern:
 * 
 * YJS Pattern:                    Loro Pattern:
 * - YEvent → $syncEvent        -> LoroEvent → $syncLoroEvent
 * - XmlText operations         -> Tree operations
 * - RelativePosition           -> Cursor position
 * - Transaction-based updates  -> Loro update transactions
 */
export function syncLoroToLexical(
  binding: LoroBinding, 
  provider: any, 
  events: Array<any>,
  isFromUndoManager: boolean,
  syncCursorPositionsFn?: (binding: LoroBinding, provider: any) => void
): void {
  const { editor } = binding;

  console.log('🔄 Syncing Loro changes to Lexical:', {
    eventCount: events.length,
    isFromUndoManager,
    hasEvents: events.length > 0
  });

  // Pre-compute deltas before editor update (following YJS pattern)
  // This ensures we have access to change information during the update
  events.forEach((event) => {
    if (event && typeof event.delta === 'function') {
      event.delta(); // Pre-compute delta
    }
  });

  editor.update(() => {
    // Add collaboration tags to prevent sync loops
    $addUpdateTag(LORO_COLLABORATION_TAG);
    if (isFromUndoManager) {
      $addUpdateTag(LORO_HISTORIC_TAG);
    }
    $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);

    try {
      // Process each Loro event and sync to Lexical
      for (let i = 0; i < events.length; i++) {
        const event = events[i];
        $syncLoroEvent(binding, event);
      }

      // Sync cursor positions after content changes
      if (syncCursorPositionsFn) {
        syncCursorPositionsFn(binding, provider);
      }

    } catch (error) {
      console.error('❌ Error syncing Loro to Lexical:', error);
    }
  }, {
    tag: LORO_COLLABORATION_TAG,
    discrete: true,
  });
}

/**
 * Sync individual Loro event to Lexical (equivalent to YJS $syncEvent)
 */
function $syncLoroEvent(binding: LoroBinding, event: any): void {
  console.log('🔄 Processing Loro event:', event);
  
  try {
    // Get the current root from Lexical
    const lexicalRoot = $getRoot();
    
    // TODO: Implement proper Loro Tree event processing
    // For now, ensure we have basic content structure
    if (lexicalRoot.getChildrenSize() === 0) {
      const paragraph = $createParagraphNode();
      const textNode = $createTextNode('');
      paragraph.append(textNode);
      lexicalRoot.append(paragraph);
      console.log('📝 Added initial paragraph to empty editor');
    }
    
    // TODO: Process specific Loro tree operations:
    // - Tree node insertions/deletions
    // - Text content changes
    // - Property updates
    // - Cursor position updates
    
  } catch (error) {
    console.error('❌ Error processing Loro event:', error);
  }
}

/**
 * Sync Lexical editor changes to Loro Tree (equivalent to YJS syncLexicalUpdateToYjs)
 * 
 * This function captures changes from the Lexical editor and converts them
 * to Loro Tree operations, following the YJS pattern:
 * 
 * Lexical Changes:              Loro Operations:
 * - Node insertions/deletions -> Tree node operations
 * - Text content changes      -> Tree text updates  
 * - Property changes          -> Tree property updates
 * - Selection changes         -> Cursor position updates
 */
export function syncLexicalToLoro(
  binding: LoroBinding,
  _provider: any,
  prevEditorState: EditorState,
  editorState: EditorState,
  dirtyElements: Map<string, boolean>,
  dirtyLeaves: Map<string, boolean>,
  normalizedNodes: Set<string>,
  tags: Set<string>
): void {
  const { doc } = binding;
  
  console.log('📝 Syncing Lexical changes to Loro:', {
    dirtyElements: dirtyElements.size,
    dirtyLeaves: dirtyLeaves.size,
    normalizedNodes: normalizedNodes.size,
    tags: Array.from(tags)
  });

  // Skip if this update came from collaboration to prevent loops
  if (tags.has(LORO_COLLABORATION_TAG) || tags.has(LORO_HISTORIC_TAG)) {
    console.log('⏭️ Skipping collaboration update to prevent loop');
    return;
  }
  
  try {
    // TODO: Implement proper Lexical to Loro Tree conversion
    // This should analyze the dirty nodes and convert to tree operations
    
    // For now, basic example of updating tree content
    if (dirtyLeaves.size > 0 || dirtyElements.size > 0) {
      console.log('🌳 Converting Lexical changes to Loro tree operations');
      
      // Get current text content (simplified approach)
      const textContent = editorState.read(() => {
        const root = $getRoot();
        return root.getTextContent();
      });
      
      // TODO: Replace with proper incremental tree operations
      // This is a placeholder that shows the pattern
      console.log('📄 Text content to sync:', textContent.slice(0, 100) + '...');
      
      // Generate update and broadcast (following YJS pattern)
      try {
        const updateBytes = doc.exportFrom(doc.version());
        if (updateBytes.length > 0) {
          console.log('📤 Generated Loro update:', updateBytes.length, 'bytes');
          // Provider should handle broadcasting this update
        }
      } catch (error) {
        console.error('❌ Error generating Loro update:', error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error syncing Lexical to Loro:', error);
  }
}

/**
 * Sync cursor positions (equivalent to YJS syncCursorPositions)
 * 
 * This function synchronizes cursor positions between collaborators
 * using Loro Cursor API (equivalent to YJS RelativePosition)
 */
export function syncLoroCursorPositions(
  binding: LoroBinding,
  provider: any
): void {
  console.log('�️ Syncing cursor positions');
  
  try {
    // TODO: Implement cursor position synchronization
    // Using Loro Cursor API to track and sync positions
    
    const { editor, cursors } = binding;
    
    // Get current selection
    const selection = editor.getEditorState().read(() => $getSelection());
    
    if (selection) {
      console.log('📍 Current selection:', selection.getType());
      // TODO: Convert to Loro Cursor and sync via awareness
    }
    
    // TODO: Render other users' cursors
    cursors.forEach((cursor, clientId) => {
      console.log('👤 Rendering cursor for client:', clientId);
      // TODO: Convert Loro Cursor to DOM position and render
    });
    
  } catch (error) {
    console.error('❌ Error syncing cursor positions:', error);
  }
}

/**
 * Initialize sync event handlers (equivalent to YJS sync setup)
 * 
 * This sets up the bidirectional sync between Loro and Lexical,
 * following the YJS collaboration pattern
 */
export function initializeSyncHandlers(binding: LoroBinding): () => void {
  const { doc, editor } = binding;
  
  console.log('🔄 Initializing Loro ↔ Lexical sync handlers');
  
  // Set up Loro document change listener (equivalent to YJS doc.on('update'))
  const handleLoroUpdate = (events: Array<any>) => {
    console.log('📥 Loro document updated, syncing to Lexical');
    syncLoroToLexical(binding, null, events, false, syncLoroCursorPositions);
  };

  // Set up Lexical editor change listener (equivalent to YJS editor.registerUpdateListener)
  const removeEditorListener = editor.registerUpdateListener(
    ({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      // Convert Lexical changes to Loro operations
      syncLexicalToLoro(
        binding, 
        null, 
        prevEditorState, 
        editorState, 
        dirtyElements, // Map<string, boolean>
        dirtyLeaves,   // Map<string, boolean>
        normalizedNodes, // Set<string>
        tags           // Set<string>
      );
    }
  );

  // TODO: Add Loro document listener when API is available
  // doc.on('update', handleLoroUpdate);
  
  console.log('✅ Sync handlers initialized');
  
  // Return cleanup function
  return () => {
    console.log('🧹 Cleaning up sync handlers');
    removeEditorListener();
    // TODO: Remove Loro document listener when available
    // doc.off('update', handleLoroUpdate);
  };
}
