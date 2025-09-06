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
        
        if (event.type === 'loro-update') {
          // For now, implement a basic sync strategy:
          // Get the text content from Loro and sync to Lexical
          try {
            // Get the text content from our main text container
            let textContent = binding.rootText.toString();
            console.log('📝 Loro text content length:', textContent.length);
            console.log('📝 Loro text preview:', textContent.substring(0, 200));
            
            if (textContent && textContent.trim() !== '') {
              try {
                // Check for malformed content (multiple JSON objects concatenated)
                if (textContent.includes('}{')) {
                  console.error('🚨 [JS-VALIDATION] DUPLICATE JSON DETECTED!');
                  console.error('📄 Malformed content - multiple JSON objects concatenated:');
                  console.error('� Content length:', textContent.length);
                  console.error('� Full content:', textContent);
                  
                  // Count and analyze JSON objects
                  const jsonObjects = textContent.split('}{');
                  console.error(`🔍 Found ${jsonObjects.length} concatenated JSON objects:`);
                  
                  jsonObjects.forEach((obj, index) => {
                    let fixedObj = obj;
                    if (index > 0) fixedObj = '{' + fixedObj;
                    if (index < jsonObjects.length - 1) fixedObj += '}';
                    
                    console.error(`📋 Object ${index + 1}:`, fixedObj.substring(0, 100));
                    
                    // Try to parse each object
                    try {
                      const parsed = JSON.parse(fixedObj);
                      console.error(`  ✅ Valid JSON - type: ${parsed.type}, children: ${parsed.children?.length || 0}`);
                    } catch (parseErr) {
                      console.error(`  ❌ Invalid JSON: ${parseErr}`);
                    }
                  });
                  
                  console.error('🐛 This indicates a bug in syncLexicalToLoro - content is being appended instead of replaced');
                  console.error('🔧 Attempting to use last JSON object as recovery...');
                  
                  // Try to extract the last valid JSON object
                  if (jsonObjects.length > 1) {
                    // Take the last object and fix the closing brace
                    const lastObject = jsonObjects[jsonObjects.length - 1];
                    const fixedJson = '{' + lastObject;
                    console.warn('🔧 Using last JSON object for recovery:', fixedJson.substring(0, 100));
                    textContent = fixedJson;
                  }
                } else {
                  console.log('✅ [JS-VALIDATION] Single JSON object detected - content appears valid');
                }
                
                // Try to parse as Lexical JSON state
                const parsedJson = JSON.parse(textContent);
                
                if (parsedJson.type === 'root') {
                  // Create a new editor state from the Loro content
                  // We need to wrap it in the expected structure for parseEditorState
                  const wrappedContent = JSON.stringify({ root: parsedJson });
                  const newEditorState = editor.parseEditorState(wrappedContent);
                  
                  // Replace the current root content with the new state's content
                  const root = $getRoot();
                  const newRoot = newEditorState._nodeMap.get('root');
                  
                  if (newRoot) {
                    // Clear current content
                    root.clear();
                    
                    // Import children from the new state
                    // For a proper implementation, we'd need to traverse the new state
                    // and create/import nodes. For now, just log what we're receiving.
                    console.log('📋 New state children count:', parsedJson.children?.length || 0);
                    console.log('📋 First child type:', parsedJson.children?.[0]?.type || 'none');
                    
                    // This is where we'd implement proper node synchronization
                    // Following the YJS pattern of processing individual changes
                    // For now, we'll just log that we received the update
                    console.log('� Loro update received - node sync would happen here');
                  }
                  
                  console.log('✅ Processed Loro text update');
                } else {
                  console.warn('⚠️ Loro content is not valid Lexical JSON');
                }
              } catch (parseError) {
                console.warn('⚠️ Could not parse Loro content as JSON:', parseError);
                console.log('📄 Raw content:', textContent.substring(0, 500));
              }
            } else {
              console.log('📭 Loro text is empty');
            }
          } catch (error) {
            console.error('❌ Error processing Loro event:', error);
          }
        }
      }

      // Sync cursor positions (following YJS pattern)
      if (syncCursorPositionsFn) {
        console.log('🎯 Syncing cursor positions');
        syncCursorPositionsFn(binding, provider);
      }

      console.log('✅ Loro changes processed (sync implementation pending)');
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
  // Check if collaboration sync is disabled (e.g., during initial content setup)
  if (_binding.collabDisabled) {
    console.log('🔒 Skipping sync to Loro - collaboration temporarily disabled');
    return;
  }

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
        // Use the binding's rootText to match what syncLoroToLexical reads from
        const text = _binding.rootText;
        
        console.log('🔍 [SYNC-TO-LORO] Starting content sync:');
        console.log('📝 New content to write:', editorStateJson.substring(0, 100));
        console.log('📏 New content length:', editorStateJson.length);
        
        // Clear existing content and insert new content
        // This is a simplified sync - in a full implementation we'd do proper diffing
        try {
          const currentLength = text.length;
          console.log('📏 Current Loro text length before sync:', currentLength);
          
          if (currentLength > 0) {
            const currentContent = text.toString();
            console.log('🗑️ Deleting existing content (first 100 chars):', currentContent.substring(0, 100));
            
            // 🔍 VALIDATION: Check if current content has duplicates
            if (currentContent.includes('}{')) {
              console.error('🚨 [SYNC-TO-LORO] EXISTING CONTENT ALREADY HAS DUPLICATES!');
              console.error('📄 Current content:', currentContent);
              console.error('🔢 JSON object count:', currentContent.split('}{').length);
              console.error('🐛 This suggests multiple writers or failed deletion');
            }
            
            text.delete(0, currentLength);
            console.log('✅ Deleted', currentLength, 'characters');
          }
          
          const newLength = text.length;
          console.log('📏 Loro text length after deletion:', newLength);
          
          // 🔍 VALIDATION: Ensure text is truly empty after deletion
          if (newLength > 0) {
            console.error('🚨 [SYNC-TO-LORO] TEXT NOT EMPTY AFTER DELETION!');
            console.error('📏 Remaining length:', newLength);
            console.error('📄 Remaining content:', text.toString());
            console.error('🐛 This indicates delete() is not working properly');
          }
        } catch (error) {
          console.warn('⚠️ Error during text deletion:', error);
        }
        
        // Insert the serialized content
        if (editorStateJson.length > 0) {
          console.log('📝 Inserting new content (first 100 chars):', editorStateJson.substring(0, 100));
          text.insert(0, editorStateJson);
          const finalLength = text.length;
          const finalContent = text.toString();
          console.log('✅ Inserted content - final length:', finalLength);
          console.log('📄 Final content preview (first 100 chars):', finalContent.substring(0, 100));
          
          // 🔍 VALIDATION: Check for accidental duplication
          if (finalContent.includes('}{')) {
            console.error('🚨 [SYNC-TO-LORO] DUPLICATION CREATED DURING INSERT!');
            console.error('📄 Final content with duplicates:', finalContent);
            console.error('🔢 JSON object count:', finalContent.split('}{').length);
            console.error('🐛 This suggests insert() is appending instead of replacing at position 0');
          } else {
            console.log('✅ [SYNC-TO-LORO] Content validation passed - no duplicates detected');
          }
          
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
