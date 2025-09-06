/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroBinding, LoroProvider } from './collaboration';
import type { LexicalEditor } from 'lexical';
import type { JSX } from 'react';
import type { LoroDoc } from 'loro-crdt';

import { mergeRegister } from '@lexical/utils';
import { 
  initLoroLocalState,
  setLoroLocalStateFocus,
  syncLexicalToLoro,
  syncLoroToLexical,
  syncLoroCursorPositions,
  createLoroUndoManager,
  LORO_CONNECTED_COMMAND,
  LORO_TOGGLE_CONNECT_COMMAND,
} from './collaboration';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  REDO_COMMAND,
  SKIP_COLLAB_TAG,
  UNDO_COMMAND,
} from 'lexical';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { InitialEditorStateType } from './LoroCollaborationPlugin';

export type LoroCursorsContainerRef = React.MutableRefObject<HTMLElement | null>;

export type SyncLoroCursorPositionsFn = (
  binding: LoroBinding,
  provider: LoroProvider
) => void;

/**
 * Hook for Loro collaboration (equivalent to useYjsCollaboration)
 * 
 * This hook manages the entire Loro collaboration lifecycle following
 * the exact same pattern as YJS collaboration:
 * 
 * Key responsibilities:
 * 1. Provider event management (status, sync, reload)
 * 2. Document change synchronization (Loro ↔ Lexical)
 * 3. Awareness updates (user presence and cursors)
 * 4. Connection lifecycle management
 * 5. Bootstrap handling for empty documents
 */
export function useLoroCollaboration(
  editor: LexicalEditor,
  id: string,
  provider: LoroProvider,
  docMap: Map<string, LoroDoc>,
  name: string,
  color: string,
  shouldBootstrap: boolean,
  binding: LoroBinding,
  setDoc: React.Dispatch<React.SetStateAction<LoroDoc | undefined>>,
  cursorsContainerRef?: LoroCursorsContainerRef,
  initialEditorState?: InitialEditorStateType,
  awarenessData?: object,
  syncCursorPositionsFn: SyncLoroCursorPositionsFn = syncLoroCursorPositions,
): JSX.Element {
  const isReloadingDoc = useRef(false);

  const connect = useCallback(() => provider.connect(), [provider]);

  const disconnect = useCallback(() => {
    try {
      provider.disconnect();
    } catch (e) {
      console.warn('Provider disconnect error:', e);
    }
  }, [provider]);

  useEffect(() => {
    const { root } = binding;
    const { awareness } = provider;

    console.log('🚀 Setting up Loro collaboration lifecycle');

    // Provider status events (following YJS pattern)
    const onStatus = ({ status }: { status: string }) => {
      console.log('📡 Provider status:', status);
      editor.dispatchCommand(LORO_CONNECTED_COMMAND, status === 'connected');
    };

    // Provider sync events (following YJS pattern)
    const onSync = (isSynced: boolean) => {
      console.log('🔄 Provider sync:', isSynced);
      
      // Bootstrap empty document (following YJS pattern exactly)
      if (
        shouldBootstrap &&
        isSynced &&
        root.isEmpty() &&
        // TODO: Check Loro document length when API is available
        // root._loroTree._length === 0 &&
        isReloadingDoc.current === false
      ) {
        console.log('📄 Bootstrapping empty document with initial state');
        initializeEditor(editor, initialEditorState);
      }

      isReloadingDoc.current = false;
    };

    // Awareness updates (following YJS pattern)
    const onAwarenessUpdate = () => {
      console.log('👥 Awareness updated - syncing cursor positions');
      syncCursorPositionsFn(binding, provider);
    };

    // Loro document changes (equivalent to YJS onYjsTreeChanges)
    // TODO: Implement when Loro provides document observation API
    // const onLoroTreeChanges = (
    //   events: Array<any>, // LoroEvent type when available
    //   origin: any,        // Transaction origin
    // ) => {
    //   console.log('📝 Loro tree changes:', events.length, 'events');
    //   
    //   // Skip if this update originated from our binding (prevent loops)
    //   if (origin !== binding) {
    //     const isFromUndoManager = false; // TODO: Detect undo manager origin
    //     syncLoroToLexical(
    //       binding,
    //       provider,
    //       events,
    //       isFromUndoManager,
    //       syncCursorPositionsFn,
    //     );
    //   }
    // };

    // Initialize local user state (following YJS pattern)
    initLoroLocalState(
      provider,
      name,
      color,
      document.activeElement === editor.getRootElement(),
      awarenessData || {},
    );

    // Provider document reload (following YJS pattern)
    const onProviderDocReload = (loroDoc: LoroDoc) => {
      console.log('🔄 Provider document reload');
      clearEditorSkipCollab(editor, binding);
      setDoc(loroDoc);
      docMap.set(id, loroDoc);
      isReloadingDoc.current = true;
    };

    // Provider initial content handler
    const onInitialContent = ({ content }: { content: string }) => {
      console.log('📋 Received initial content, applying to editor');
      try {
        // Parse the JSON content and set as editor state
        const editorState = editor.parseEditorState(content);
        editor.setEditorState(editorState);
        console.log('✅ Initial content applied successfully');
      } catch (error) {
        console.error('❌ Failed to apply initial content:', error);
      }
    };

    // Provider update handler - when we receive updates from other clients
    // Following YJS pattern: convert updates to events and call syncLoroToLexical
    const onProviderUpdate = (update: Uint8Array) => {
      console.log('📥 [COLLABORATION] Received Loro update from other client:', {
        updateSize: update.length,
        updatePreview: Array.from(update.slice(0, 10))
      });
      
      try {
        // Apply the update to the Loro document first
        console.log('🔧 [COLLABORATION] Applying update to local Loro document...');
        binding.doc.import(update);
        console.log('✅ [COLLABORATION] Update imported to local Loro document');
        
        // 🔍 VALIDATION: Check document state after import
        const textAfterImport = binding.rootText.toString();
        console.log('🔍 [COLLABORATION] Document state after import:', {
          textLength: textAfterImport.length,
          textPreview: textAfterImport.substring(0, 100),
          hasDuplicates: textAfterImport.includes('}{'),
          duplicateCount: textAfterImport.includes('}{') ? textAfterImport.split('}{').length : 1
        });
        
        if (textAfterImport.includes('}{')) {
          console.error('🚨 [COLLABORATION] DUPLICATES DETECTED AFTER IMPORT!');
          console.error('📄 Full content with duplicates:', textAfterImport);
        }
        
        // Create a mock event structure similar to YJS events
        // For now, we'll create a simple event that represents the update
        const mockEvents = [{
          type: 'loro-update',
          update: update,
          target: binding.rootText, // Point to our text container
          doc: binding.doc
        }];
        
        console.log('🔄 [COLLABORATION] Calling syncLoroToLexical with mock events...');
        
        // Call our sync function following the YJS pattern exactly
        // This will use editor.update() with proper collaboration tags
        syncLoroToLexical(
          binding,
          provider,
          mockEvents,
          false, // not from undo manager
          syncLoroCursorPositions
        );
        
        console.log('✅ [COLLABORATION] Loro update processed via syncLoroToLexical');
      } catch (error) {
        console.error('❌ [COLLABORATION] Failed to process Loro update:', error);
        if (error instanceof Error) {
          console.error('🔍 Error details:', error.stack);
        }
      }
    };

    // Register provider event listeners (following YJS pattern)
    provider.on('reload', onProviderDocReload);
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.on('initial-content', onInitialContent);
    provider.on('update', onProviderUpdate);
    
    // Register awareness events (when awareness system is implemented)
    if (awareness) {
      awareness.on('update', onAwarenessUpdate);
    }
    
    // Register Loro document observers (when API is available)
    // This updates the local editor state when we receive updates from other clients
    // TODO: Implement when Loro provides document observation API
    // root.getLoroTree().observeDeep(onLoroTreeChanges);
    
    // Register Lexical update listener (following YJS pattern exactly)
    const removeListener = editor.registerUpdateListener(
      ({
        prevEditorState,
        editorState,
        dirtyLeaves,
        dirtyElements,
        normalizedNodes,
        tags,
      }) => {
        if (tags.has(SKIP_COLLAB_TAG) === false) {
          syncLexicalToLoro(
            binding,
            provider,
            prevEditorState,
            editorState,
            dirtyElements,
            dirtyLeaves,
            normalizedNodes,
            tags,
          );
        }
      },
    );

    // Connect to provider
    const connectionPromise = connect();

    return () => {
      if (isReloadingDoc.current === false) {
        if (connectionPromise && typeof connectionPromise.then === 'function') {
          connectionPromise.then(disconnect);
        } else {
          // Workaround for race condition in StrictMode (following YJS pattern)
          disconnect();
        }
      }

      // Clean up provider event listeners
      provider.off('sync', onSync);
      provider.off('status', onStatus);
      provider.off('reload', onProviderDocReload);
      provider.off('initial-content', onInitialContent);
      provider.off('update', onProviderUpdate);
      
      // Clean up awareness listeners
      if (awareness) {
        awareness.off('update', onAwarenessUpdate);
      }
      
      // Clean up document observers
      // TODO: Implement when Loro provides unobserve API
      // root.getLoroTree().unobserveDeep(onLoroTreeChanges);
      
      // Clean up resources
      docMap.delete(id);
      removeListener();
    };
  }, [
    binding,
    color,
    connect,
    disconnect,
    docMap,
    editor,
    id,
    initialEditorState,
    name,
    provider,
    shouldBootstrap,
    awarenessData,
    setDoc,
    syncCursorPositionsFn,
  ]);

  // Create cursors container portal (following YJS pattern)
  const cursorsContainer = useMemo(() => {
    const ref = (element: null | HTMLElement) => {
      binding.cursorsContainer = element;
    };

    return createPortal(
      <div ref={ref} />,
      (cursorsContainerRef && cursorsContainerRef.current) || document.body,
    );
  }, [binding, cursorsContainerRef]);

  // Register toggle connect command (following YJS pattern)
  useEffect(() => {
    return editor.registerCommand(
      LORO_TOGGLE_CONNECT_COMMAND,
      (payload) => {
        const shouldConnect = payload;

        if (shouldConnect) {
          console.log('🔗 Loro collaboration connected!');
          connect();
        } else {
          console.log('🔌 Loro collaboration disconnected!');
          disconnect();
        }

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [connect, disconnect, editor]);

  return cursorsContainer;
}

/**
 * Hook for Loro focus tracking (equivalent to useYjsFocusTracking)
 * 
 * Tracks editor focus/blur events and updates awareness state
 */
export function useLoroFocusTracking(
  editor: LexicalEditor,
  provider: LoroProvider,
  name: string,
  color: string,
  awarenessData?: object,
) {
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setLoroLocalStateFocus(provider, name, color, true, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setLoroLocalStateFocus(provider, name, color, false, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [color, editor, name, provider, awarenessData]);
}

/**
 * Hook for Loro history management (equivalent to useYjsHistory)
 * 
 * Provides undo/redo functionality integrated with Loro CRDT
 */
export function useLoroHistory(
  editor: LexicalEditor,
  binding: LoroBinding,
): () => void {
  const undoManager = useMemo(
    () => createLoroUndoManager(binding, binding.rootTree),
    [binding],
  );

  useEffect(() => {
    const undo = () => {
      console.log('↶ Undo operation');
      undoManager.undo();
    };

    const redo = () => {
      console.log('↷ Redo operation');
      undoManager.redo();
    };

    return mergeRegister(
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          undo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        REDO_COMMAND,
        () => {
          redo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [editor, undoManager]);

  const clearHistory = useCallback(() => {
    console.log('🗑️ Clearing history');
    undoManager.clear();
  }, [undoManager]);

  // Expose undo and redo states (following YJS pattern)
  React.useEffect(() => {
    // TODO: Implement when Loro undo manager provides stack info
    // const updateUndoRedoStates = () => {
    //   editor.dispatchCommand(CAN_UNDO_COMMAND, undoManager.undoStack.length > 0);
    //   editor.dispatchCommand(CAN_REDO_COMMAND, undoManager.redoStack.length > 0);
    //   console.log('📊 Undo/redo states updated');
    // };

    // TODO: Register undo manager events when Loro API is available
    // undoManager.on('stack-item-added', updateUndoRedoStates);
    // undoManager.on('stack-item-popped', updateUndoRedoStates);
    // undoManager.on('stack-cleared', updateUndoRedoStates);

    return () => {
      // TODO: Clean up undo manager listeners
      // undoManager.off('stack-item-added', updateUndoRedoStates);
      // undoManager.off('stack-item-popped', updateUndoRedoStates);
      // undoManager.off('stack-cleared', updateUndoRedoStates);
    };
  }, [editor, undoManager]);

  return clearHistory;
}

/**
 * Initialize editor with content (following YJS initializeEditor pattern)
 * This is called when bootstrapping an empty document, just like YJS
 */
function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  editor.update(
    () => {
      const root = $getRoot();

      if (root.isEmpty()) {
        if (initialEditorState) {
          switch (typeof initialEditorState) {
            case 'string': {
              const parsedEditorState = editor.parseEditorState(initialEditorState);
              editor.setEditorState(parsedEditorState, {
                tag: HISTORY_MERGE_TAG,
              });
              break;
            }
            case 'object': {
              editor.setEditorState(initialEditorState, {
                tag: HISTORY_MERGE_TAG,
              });
              break;
            }
            case 'function': {
              editor.update(
                () => {
                  const root1 = $getRoot();
                  if (root1.isEmpty()) {
                    initialEditorState(editor);
                  }
                },
                { tag: HISTORY_MERGE_TAG },
              );
              break;
            }
          }
        } else {
          const paragraph = $createParagraphNode();
          root.append(paragraph);
          const { activeElement } = document;

          if (
            $getSelection() !== null ||
            (activeElement !== null && activeElement === editor.getRootElement())
          ) {
            paragraph.select();
          }
        }
      }
    },
    {
      tag: HISTORY_MERGE_TAG,
    },
  );
}

/**
 * Clear editor for document reload (following YJS clearEditorSkipCollab pattern)
 */
function clearEditorSkipCollab(editor: LexicalEditor, binding: LoroBinding) {
  // Reset editor state
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.select();
    },
    {
      tag: SKIP_COLLAB_TAG,
    },
  );

  // Clear cursors in DOM (following YJS pattern)
  if (binding.cursors == null) {
    return;
  }

  const cursors = binding.cursors;
  const cursorsContainer = binding.cursorsContainer;

  if (cursorsContainer == null) {
    return;
  }

  // Reset cursors in DOM
  const cursorsArr = Array.from(cursors.values());

  for (let i = 0; i < cursorsArr.length; i++) {
    const cursor = cursorsArr[i];
    const selection = cursor.selection;

    if (selection && selection.selections != null) {
      const selections = selection.selections;

      for (let j = 0; j < selections.length; j++) {
        cursorsContainer.removeChild(selections[i]);
      }
    }
  }
}
