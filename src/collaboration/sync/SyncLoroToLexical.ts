/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LexicalEditor } from 'lexical';
import type { LoroBinding } from '../LoroBinding';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';

/**
 * Sync Loro Tree state to Lexical editor
 * This is equivalent to YJS syncYjsToLexical functionality
 */
export function syncLoroToLexical(
  binding: LoroBinding, 
  _provider: any, 
  _events: Array<any>,
  _transaction: any
): void {
  const { editor, rootTree } = binding;

  editor.update(() => {
    try {
      // Get the current root from Lexical
      const lexicalRoot = $getRoot();
      
      // For now, let's implement a basic sync
      // TODO: Implement proper tree traversal and incremental updates
      
      // Get content from Loro tree
      // This is a placeholder - need to implement proper tree traversal
      console.log('🔄 Syncing Loro tree to Lexical:', rootTree);
      
      // Example: If tree is empty, ensure we have a paragraph
      if (lexicalRoot.getChildrenSize() === 0) {
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode('');
        paragraph.append(textNode);
        lexicalRoot.append(paragraph);
      }
      
    } catch (error) {
      console.error('❌ Error syncing Loro to Lexical:', error);
    }
  }, {
    tag: 'collaboration',
    discrete: true,
  });
}

/**
 * Sync Lexical editor state to Loro Tree
 * This is equivalent to YJS syncLexicalToYjs functionality
 */
export function syncLexicalToLoro(
  binding: LoroBinding,
  _events: Array<any>,
  _transaction: any
): void {
  const { rootTree } = binding;
  
  try {
    // TODO: Implement proper sync from Lexical to Loro Tree
    // This should convert Lexical operations to Loro tree operations
    console.log('📝 Syncing Lexical to Loro tree:', rootTree);
    
  } catch (error) {
    console.error('❌ Error syncing Lexical to Loro:', error);
  }
}

/**
 * Initialize sync event handlers
 * This sets up the bidirectional sync between Loro and Lexical
 */
export function initializeSyncHandlers(binding: LoroBinding): () => void {
  const { doc, editor } = binding;
  
  // Set up Loro document change listener
  const handleLoroUpdate = (events: Array<any>) => {
    syncLoroToLexical(binding, null, events, null);
  };

  // Set up Lexical editor change listener  
  const removeEditorListener = editor.registerUpdateListener(
    ({ editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }) => {
      // Skip collaboration updates to avoid loops
      if (tags.has('collaboration') || tags.has('historic')) {
        return;
      }
      
      // Convert Lexical changes to Loro operations
      syncLexicalToLoro(binding, [], null);
    }
  );

  // TODO: Add Loro document listener when API is available
  // doc.on('update', handleLoroUpdate);
  
  // Return cleanup function
  return () => {
    removeEditorListener();
    // TODO: Remove Loro listener when API is available
    // doc.off('update', handleLoroUpdate);
  };
}
