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
import type {Provider} from './State';
import {
  CONNECTED_COMMAND,
  createUndoManager,
  initLocalState,
  setLocalStateFocus,
  TOGGLE_CONNECT_COMMAND,
} from './State';
import { Binding } from './Bindings';
import { syncCRDTUpdatesToLexical, syncLexicalUpdatesToCRDT } from './sync/SyncEditorStates';
import { syncCursorPositions, SyncCursorPositionsFn } from './sync/SyncCursors';

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
      if (
        shouldBootstrap &&
        isSynced &&
        root.isEmpty() &&
        isReloadingDoc.current === false
      ) {
        initializeEditor(editor, initialEditorState);
        
        // 🔧 HIERARCHY FIX: After initializing editor, ensure Lexical structure is synced to CRDT
        setTimeout(() => {
          editor.update(() => {
            const lexicalRoot = $getRoot();
            const crdtRoot = binding.root;
            
            // Force sync if Lexical has structure but CRDT doesn't
            if (lexicalRoot.getChildren().length > 0 && crdtRoot._children.length === 0) {
              crdtRoot.syncChildrenFromLexical(
                binding,
                lexicalRoot,
                null, // prevNodeMap
                new Map([['root', true]]), // mark root as dirty
                new Set() // dirtyLeaves
              );
              
              // Log final structure
              if ((crdtRoot as any).logHierarchy) {
                (crdtRoot as any).logHierarchy("🏗️ [FINAL-STRUCTURE] ");
              }
            }
          });
        }, 100); // Small delay to ensure initialization is complete
      }

      isReloadingDoc.current = false;
    };

    const onAwarenessUpdate = () => {
      syncCursorPositionsFn(binding, provider);
    };

    initLocalState(
      provider,
      name,
      color,
      document.activeElement === editor.getRootElement(),
      awarenessData || {},
    );

    const onProviderDocReload = (doc: LoroDoc) => {
      clearEditorSkipCollab(editor, binding);
      setDoc(doc);
      docMap.set(id, doc);
      isReloadingDoc.current = true;
    };

    provider.on('reload', onProviderDocReload);
    provider.on('status', onStatus);
    provider.on('sync', onSync);

    awareness.on('update', onAwarenessUpdate);

    const onCRDTTreeChanges = (event: LoroEventBatch) => {
      // Only skip if the origin is from this specific editor's changes
      // We set 'lexical-edit' as origin when making changes from this editor
      // So we should skip only if the origin is 'lexical-edit' (our own changes)
      const isFromThisEditor = event.origin === binding.doc.peerIdStr;
      if (!isFromThisEditor) {
        // Check if this change is from the undo manager
        // const isFromUndoManger = origin instanceof UndoManager;
        const isFromUndoManager = false;
        syncCRDTUpdatesToLexical(
          binding,
          provider,
          event,
          isFromUndoManager,
          syncCursorPositionsFn,
        );
      }
      
    };
    // This updates the local editor state when we receive updates from other clients
    const unsubscribe = binding.doc.subscribe(onCRDTTreeChanges);

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
          syncLexicalUpdatesToCRDT(
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

    const connectionPromise = connect();

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
          connect();
        } else {
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
  editor.update(
    () => {
      const root = $getRoot();
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
          const paragraph = $createParagraphNode();
          root.append(paragraph);          
          const {activeElement} = document;

          if (
            $getSelection() !== null ||
            (activeElement !== null &&
              activeElement === editor.getRootElement())
          ) {
            paragraph.select();
          }
        }
      }
    },
    {tag: HISTORY_MERGE_TAG},
  );
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
