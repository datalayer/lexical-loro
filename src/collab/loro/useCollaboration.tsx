/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import * as React from 'react';
import type {JSX} from 'react';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {createPortal} from 'react-dom';
import type {LexicalEditor} from 'lexical';
import {mergeRegister} from '@lexical/utils';
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  REDO_COMMAND,
  SKIP_COLLAB_TAG,
  UNDO_COMMAND,
} from 'lexical';
import {InitialEditorStateType} from '@lexical/react/LexicalComposer';
import {LoroDoc, LoroEventBatch, UndoManager} from 'loro-crdt';
import type {Binding, Provider, SyncCursorPositionsFn} from './State';
import {
  CONNECTED_COMMAND,
  createUndoManager,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  syncLexicalUpdateToCRDT,
  syncCRDTChangesToLexical,
  TOGGLE_CONNECT_COMMAND,
} from './State';

export type CursorsContainerRef = React.MutableRefObject<HTMLElement | null>;

export function useCollaboration(
  editor: LexicalEditor,
  id: string,
  provider: Provider,
  docMap: Map<string, LoroDoc>,
  name: string,
  color: string,
  shouldBootstrap: boolean,
  binding: Binding,
  setDoc: React.Dispatch<React.SetStateAction<LoroDoc | undefined>>,
  cursorsContainerRef?: CursorsContainerRef,
  initialEditorState?: InitialEditorStateType,
  awarenessData?: object,
  syncCursorPositionsFn: SyncCursorPositionsFn = syncCursorPositions,
): JSX.Element {
  const isReloadingDoc = useRef(false);
  const undoManagerRef = useRef<UndoManager | null>(null);
  const skipCollaborationUpdateRef = useRef(false);

  // Enhanced undo/redo state management
  const updateUndoRedoStates = useCallback(() => {
    if (undoManagerRef.current) {
      editor.dispatchCommand(
        CAN_UNDO_COMMAND,
        undoManagerRef.current.canUndo(),
      );
      editor.dispatchCommand(
        CAN_REDO_COMMAND,
        undoManagerRef.current.canRedo(),
      );
    }
  }, [editor]);

  // Implementation of clearEditorSkipCollaborationUpdate equivalent
  const clearEditorSkipCollaborationUpdate = useCallback(() => {
    skipCollaborationUpdateRef.current = false;
  }, []);

  const connect = useCallback(() => provider.connect(), [provider]);

  const disconnect = useCallback(() => {
    try {
      provider.disconnect();
    } catch (e) {
      // Do nothing
    }
  }, [provider]);

  useEffect(() => {
    const {root} = binding;
    const {awareness} = provider;

    const onStatus = ({status}: {status: string}) => {
      editor.dispatchCommand(CONNECTED_COMMAND, status === 'connected');
    };

    const onSync = (isSynced: boolean) => {
      console.log(`[UseCollaboration] onSync CALLED (YJS-style):`, {
        isSynced,
        shouldBootstrap,
        rootIsEmpty: root.isEmpty(),
        rootXmlTextLength: root._xmlText.length,
        isReloadingDoc: isReloadingDoc.current,
        willInitialize: shouldBootstrap && isSynced && root.isEmpty() && root._xmlText.length === 0 && isReloadingDoc.current === false
      });
      
      if (
        shouldBootstrap &&
        isSynced &&
        root.isEmpty() &&
        isReloadingDoc.current === false
      ) {
        console.log(`[UseCollaboration] INITIALIZING EDITOR (YJS-style)`);
        initializeEditor(editor, initialEditorState);
        console.log(`[UseCollaboration] INITIALIZATION COMPLETE`);
      }

      isReloadingDoc.current = false;
    };

    const onAwarenessUpdate = () => {
      syncCursorPositionsFn(binding, provider);
    };

    const onLoroTreeChanges = (
      event: LoroEventBatch,
    ) => {
      console.log(`[UseCollaboration] onLoroTreeChanges CALLED:`, {
        event: event,
        eventBy: event.by,
        eventOrigin: event.origin,
        hasEvents: !!event.events,
        eventsCount: event.events?.length,
        skipCollab: skipCollaborationUpdateRef.current
      });
      
      // In Loro, we need to determine if this event originated from local changes or remote updates
      // Check multiple indicators:
      // 1. event.origin === 'lexical-edit' means it's from our local editor changes
      // 2. event.by === 'local' can also indicate local
      const isLocalChange = event.origin === 'lexical-edit' || event.by === 'local';
      const origin = isLocalChange ? 'local' : 'remote';
      
      console.log(`[UseCollaboration] Change classification:`, {
        isLocalChange,
        origin,
        eventOrigin: event.origin,
        eventBy: event.by
      });
      
      // Skip processing if we should skip collaboration updates
      if (skipCollaborationUpdateRef.current) {
        console.log(`[UseCollaboration] Skipping collaboration update (skipCollaborationUpdateRef)`);
        skipCollaborationUpdateRef.current = false;
        return;
      }
      
      if (!isLocalChange) { // Only process remote changes
        console.log(`[UseCollaboration] Processing remote change - calling syncCRDTChangesToLexical`);
        
        // Check if this change is from the undo manager
        const isFromUndoManager = undoManagerRef.current?.peer() === event.origin;
        
        syncCRDTChangesToLexical(
          binding,
          provider,
          event.events, // Array of LoroEvent
          isFromUndoManager,
          syncCursorPositionsFn,
        );
      } else {
        console.log(`[UseCollaboration] Skipping local change (origin: ${origin}, by: ${event.by})`);
      }
    };

    // Initialize the undo manager
    if (!undoManagerRef.current) {
      const undoManager = createUndoManager(binding, binding.root.getSharedType());
      undoManagerRef.current = undoManager;
    }

    initLocalState(
      provider,
      name,
      color,
      document.activeElement === editor.getRootElement(),
      awarenessData || {},
    );

    const onProviderDocReload = (loroDoc: LoroDoc) => {
      clearEditorSkipCollaborationUpdate();

      // Update document references
      docMap.set(id, loroDoc);
      setDoc(loroDoc);
      
      // Create new undo manager for the reloaded document  
      const newUndoManager = createUndoManager(binding, binding.root.getSharedType());
      undoManagerRef.current = newUndoManager;
    };    console.log(`[UseCollaboration] Setting up provider event listeners`);

    provider.on('reload', onProviderDocReload);
    provider.on('status', onStatus);
    provider.on('sync', onSync);

    awareness.on('update', onAwarenessUpdate);

    console.log(`[UseCollaboration] Provider event listeners setup complete`);

    // This updates the local editor state when we receive updates from other clients
    // Subscribe to Loro document changes
    const doc = docMap.get(id);
    console.log(`[UseCollaboration] Setting up document subscription:`, {
      id,
      hasDoc: !!doc,
      docMapSize: docMap.size,
      docMapKeys: Array.from(docMap.keys())
    });
    const unsubscribe = doc?.subscribe(onLoroTreeChanges);
    console.log(`[UseCollaboration] Document subscription result:`, {
      hasUnsubscribe: !!unsubscribe,
      subscribed: !!doc && !!unsubscribe
    });
    const removeListener = editor.registerUpdateListener(
      ({
        prevEditorState,
        editorState,
        dirtyLeaves,
        dirtyElements,
        normalizedNodes,
        tags,
      }) => {
        console.log('🔥 useCollaboration: registerUpdateListener TRIGGERED', {
          hasSkipCollabTag: tags.has(SKIP_COLLAB_TAG),
          skipCollaborationUpdate: skipCollaborationUpdateRef.current,
          dirtyElementsKeys: Array.from(dirtyElements.keys()),
          dirtyLeavesKeys: Array.from(dirtyLeaves),
          dirtyLeavesSize: dirtyLeaves.size,
          tagsArray: Array.from(tags),
          editorStateDiff: editorState !== prevEditorState,
          timestamp: Date.now()
        });
        
        if (tags.has(SKIP_COLLAB_TAG) === false && !skipCollaborationUpdateRef.current) {
          // Only sync if there are actual changes
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0 && normalizedNodes.size === 0) {
            console.log('⏭️ useCollaboration: Skipping sync - no dirty elements, leaves, or normalized nodes');
            return;
          }
          
          console.log('🎯 useCollaboration: USER CHANGE DETECTED - proceeding with sync', {
            dirtyElementsKeys: Array.from(dirtyElements.keys()),
            dirtyLeavesKeys: Array.from(dirtyLeaves),
            normalizedNodesKeys: Array.from(normalizedNodes),
            hasSkipCollabTag: tags.has(SKIP_COLLAB_TAG),
            skipCollaborationUpdate: skipCollaborationUpdateRef.current
          });
          
          // Set origin to indicate this is a local edit for undo manager
          const doc = docMap.get(id);
          if (doc) {
            doc.setNextCommitOrigin('lexical-edit');
            console.log('useCollaboration: Set commit origin to lexical-edit');
          } else {
            console.warn('useCollaboration: Could not find doc in docMap for id:', id);
          }
          
          console.log('🚀 useCollaboration: Calling syncLexicalUpdateToCRDT');
          syncLexicalUpdateToCRDT(
            binding,
            provider,
            prevEditorState,
            editorState,
            dirtyElements,
            dirtyLeaves,
            normalizedNodes,
            tags,
          );
        } else {
          console.log('⏭️ useCollaboration: Skipping syncLexicalUpdateToCRDT', {
            hasSkipCollabTag: tags.has(SKIP_COLLAB_TAG),
            skipCollaborationUpdate: skipCollaborationUpdateRef.current
          });
        }
      },
    );

    console.log(`[UseCollaboration] About to call connect()`);
    const connectionPromise = connect();
    console.log(`[UseCollaboration] connect() called, connectionPromise:`, !!connectionPromise);

    return () => {
      if (isReloadingDoc.current === false) {
        if (connectionPromise) {
          connectionPromise.then(disconnect);
        } else {
          // Workaround for race condition in StrictMode. It's possible there
          // is a different race for the above case where connect returns a
          // promise, but we don't have an example of that in-repo.
          // It's possible that there is a similar issue with
          // TOGGLE_CONNECT_COMMAND below when the provider connect returns a
          // promise.
          // https://github.com/facebook/lexical/issues/6640
          disconnect();
        }
      }

      provider.off('sync', onSync);
      provider.off('status', onStatus);
      provider.off('reload', onProviderDocReload);
      awareness.off('update', onAwarenessUpdate);
      // Unsubscribe from Loro document changes
      unsubscribe?.();
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
  const cursorsContainer = useMemo(() => {
    const ref = (element: null | HTMLElement) => {
      binding.cursorsContainer = element;
    };

    return createPortal(
      <div ref={ref} />,
      (cursorsContainerRef && cursorsContainerRef.current) || document.body,
    );
  }, [binding, cursorsContainerRef]);

  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_CONNECT_COMMAND,
      (payload) => {
        const shouldConnect = payload;

        if (shouldConnect) {
          // eslint-disable-next-line no-console
          console.log('Collaboration connected!');
          connect();
        } else {
          // eslint-disable-next-line no-console
          console.log('Collaboration disconnected!');
          disconnect();
        }

        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [connect, disconnect, editor]);

  return cursorsContainer;
}

export function useFocusTracking(
  editor: LexicalEditor,
  provider: Provider,
  name: string,
  color: string,
  awarenessData?: object,
) {
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, true, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setLocalStateFocus(provider, name, color, false, awarenessData || {});
          return false;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );
  }, [color, editor, name, provider, awarenessData]);
}

export function useHistory(
  editor: LexicalEditor,
  binding: Binding,
): () => void {
  const undoManager = useMemo(
    () => createUndoManager(binding, binding.root.getSharedType()),
    [binding],
  );

  useEffect(() => {
    const undo = () => {
      undoManager.undo();
    };

    const redo = () => {
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
  });
  const clearHistory = useCallback(() => {
    undoManager.clear();
  }, [undoManager]);

  // Exposing undo and redo states
  React.useEffect(() => {
    const updateUndoRedoStates = () => {
      editor.dispatchCommand(
        CAN_UNDO_COMMAND,
        undoManager.canUndo(),
      );
      editor.dispatchCommand(
        CAN_REDO_COMMAND,
        undoManager.canRedo(),
      );
    };
    
    // Initial state update
    updateUndoRedoStates();
    
    // Loro UndoManager doesn't have event listeners like YJS
    // We would need to check state periodically or after operations
    // For now, update after each operation
    
    return () => {
      // No cleanup needed for Loro UndoManager events
    };
  }, [editor, undoManager]);

  return clearHistory;
}

function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  console.log(`[InitializeEditor] STARTING initialization:`, {
    hasInitialEditorState: !!initialEditorState,
    initialEditorStateType: typeof initialEditorState
  });
  
  editor.update(
    () => {
      const root = $getRoot();
      console.log(`[InitializeEditor] Inside editor.update:`, {
        rootIsEmpty: root.isEmpty(),
        rootChildren: root.getChildren().length,
        rootChildrenKeys: root.getChildren().map(c => c.getKey())
      });

      if (root.isEmpty()) {
        if (initialEditorState) {
          switch (typeof initialEditorState) {
            case 'string': {
              const parsedEditorState =
                editor.parseEditorState(initialEditorState);
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
                {tag: HISTORY_MERGE_TAG},
              );
              break;
            }
          }
        } else {
          console.log(`[InitializeEditor] Creating default paragraph (no initialEditorState provided)`);
          const paragraph = $createParagraphNode();
          console.log(`[InitializeEditor] Created paragraph:`, {
            paragraphKey: paragraph.getKey(),
            paragraphType: paragraph.getType()
          });
          
          root.append(paragraph);
          console.log(`[InitializeEditor] Appended paragraph to root:`, {
            rootChildren: root.getChildren().length,
            rootChildrenKeys: root.getChildren().map(c => c.getKey()),
            rootChildrenTypes: root.getChildren().map(c => c.getType())
          });
          
          const {activeElement} = document;

          if (
            $getSelection() !== null ||
            (activeElement !== null &&
              activeElement === editor.getRootElement())
          ) {
            console.log(`[InitializeEditor] Selecting paragraph`);
            paragraph.select();
          }
        }
      }
    },
    {tag: HISTORY_MERGE_TAG},
  );
  
  console.log(`[InitializeEditor] COMPLETED initialization`);
}

function clearEditorSkipCollab(editor: LexicalEditor, binding: Binding) {
  // reset editor state
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

  if (binding.cursors == null) {
    return;
  }

  const cursors = binding.cursors;

  if (cursors == null) {
    return;
  }
  const cursorsContainer = binding.cursorsContainer;

  if (cursorsContainer == null) {
    return;
  }

  // reset cursors in dom
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
