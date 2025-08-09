/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {
  Binding,
  Provider,
  SyncCursorPositionsFn,
} from '.';
import type {LexicalEditor} from 'lexical';
import type {JSX} from 'react';
import type {LoroDoc} from 'loro-crdt';

import {mergeRegister} from '@lexical/utils';
import {
  CONNECTED_COMMAND,
  createUndoManager,
  initLocalState,
  setLocalStateFocus,
  syncCursorPositions,
  $syncLexicalUpdateToLoro,
  syncLoroChangesToLexical,
  TOGGLE_CONNECT_COMMAND,
} from '.';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  ElementNode,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  REDO_COMMAND,
  SKIP_COLLAB_TAG,
  TextNode,
  UNDO_COMMAND,
} from 'lexical';
import * as React from 'react';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {createPortal} from 'react-dom';

import {InitialEditorStateType} from '@lexical/react/LexicalComposer';

export type CursorsContainerRef = React.MutableRefObject<HTMLElement | null>;

export function useLoroCollaboration(
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
      }

      isReloadingDoc.current = false;
    };

    const onAwarenessUpdate = () => {
      if (binding.cursorsContainer) {
        syncCursorPositionsFn(binding, provider, binding.cursorsContainer);
      }
    };

    const onLoroTreeChanges = (events: Array<any>, transaction: any) => {
      editor.update(
        () => {
          syncLoroChangesToLexical(binding, events, transaction);
        },
        {
          onUpdate: () => {
            if (binding.cursorsContainer) {
              syncCursorPositionsFn(binding, provider, binding.cursorsContainer);
            }
          },
          skipTransforms: true,
          tag: 'collaboration',
        },
      );
    };

    const onReload = (ydoc: LoroDoc) => {
      clearEditorSkipCollab(editor, binding);
      setDoc(ydoc);
      isReloadingDoc.current = true;
    };

    initLocalState(provider, name, color, false, awarenessData || {});

    // Set up provider update listener for incoming changes
    const onProviderUpdate = (update: Uint8Array, origin: unknown) => {
      console.log('Provider received update, syncing to Lexical', { 
        updateSize: update.length, 
        origin,
        providerUserId: (provider as any).userId,
        isOwnUpdate: origin === provider || (origin as any)?.userId === (provider as any).userId
      });
      
      // More robust check to avoid processing our own updates
      if (origin === provider || (origin as any)?.userId === (provider as any).userId) {
        console.log('Skipping own update to avoid infinite loop');
        return;
      }
      
      editor.update(() => {
        // Get the text content from Loro and update Lexical
        try {
          const loroDoc = binding.doc;
          const textContainer = loroDoc.getText('content');
          const loroText = textContainer.toString();
          
          // Get current Lexical content
          const root = $getRoot();
          const currentLexicalText = root.getTextContent();
          
          console.log('Incoming sync comparison', {
            loroText: JSON.stringify(loroText),
            currentLexicalText: JSON.stringify(currentLexicalText),
            loroLength: loroText.length,
            lexicalLength: currentLexicalText.length
          });
          
          // Only update if content is different
          if (loroText !== currentLexicalText) {
            console.log('Updating Lexical with Loro content');
            
            // Clear the root and rebuild
            root.clear();
            
            if (loroText.length > 0) {
              // Create a single paragraph and add the text as one node
              // Don't split by newlines to avoid creating multiple paragraphs
              const paragraph = $createParagraphNode();
              const textNode = $createTextNode(loroText);
              paragraph.append(textNode);
              root.append(paragraph);
            } else {
              // Empty content, ensure we have at least one paragraph
              const paragraph = $createParagraphNode();
              root.append(paragraph);
            }
            
            console.log('Updated Lexical content');
          } else {
            console.log('Content is the same, no update needed');
          }
        } catch (error) {
          console.error('Error syncing Loro to Lexical:', error);
        }
      }, { tag: 'skip-collab' });
    };

    const unregisterObserver = mergeRegister(
      // provider.on('status', onStatus), // TODO: Fix return type mismatch
      // provider.on('sync', onSync),     // TODO: Implement sync events
      // provider.on('reload', onReload), // TODO: Implement reload events
      // awareness.on('update', onAwarenessUpdate), // TODO: Fix return type mismatch
      // Set up update listener
      () => {
        provider.on('update', onProviderUpdate);
        return () => provider.off('update', onProviderUpdate);
      },
    );

    const removeListener = editor.registerUpdateListener(
      ({
        dirtyElements,
        dirtyLeaves,
        editorState,
        normalizedNodes,
        prevEditorState,
        tags,
      }) => {
        if (tags.has('skip-collab') === false) {
          editor.read(() => {
            $syncLexicalUpdateToLoro(
              binding, 
              provider, 
              prevEditorState, 
              editorState,
              dirtyElements,
              dirtyLeaves,
              normalizedNodes,
              tags
            );
          });
        }
      },
    );

    connect();

    return () => {
      disconnect();
      unregisterObserver();
      removeListener();
    };
  }, [
    binding,
    provider,
    editor,
    connect,
    disconnect,
    shouldBootstrap,
    name,
    color,
    initialEditorState,
    awarenessData,
    setDoc,
    syncCursorPositionsFn,
  ]);

  // ... rest will be implemented similarly to useYjsCollaboration
  return <></>;
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
              editor.setEditorState(parsedEditorState, {tag: SKIP_COLLAB_TAG});
              break;
            }
            case 'object': {
              editor.setEditorState(initialEditorState, {tag: SKIP_COLLAB_TAG});
              break;
            }
            case 'function': {
              editor.update(
                () => {
                  const rootNode = $getRoot();
                  if (rootNode.isEmpty()) {
                    initialEditorState(editor);
                  }
                },
                {tag: SKIP_COLLAB_TAG},
              );
              break;
            }
          }
        } else {
          const paragraph = $createParagraphNode();
          root.append(paragraph);
          paragraph.select();
        }
      }
    },
    {
      tag: SKIP_COLLAB_TAG,
    },
  );
}

function clearEditorSkipCollab(editor: LexicalEditor, binding: Binding): void {
  // Placeholder implementation
}

export function useLoroFocusTracking(
  editor: LexicalEditor,
  provider: Provider,
  name: string,
  color: string,
  awarenessData?: object,
): void {
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
  }, [editor, provider, name, color, awarenessData]);
}

export function useLoroHistory(editor: LexicalEditor, binding: Binding): void {
  const undoManager = useMemo(() => {
    return createUndoManager(binding, binding.root._loroText);
  }, [binding]);

  useEffect(() => {
    const unregister = mergeRegister(
      editor.registerCommand(
        UNDO_COMMAND,
        () => {
          undoManager.undo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        REDO_COMMAND,
        () => {
          undoManager.redo();
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        () => {
          return undoManager.canUndo();
        },
        COMMAND_PRIORITY_EDITOR,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        () => {
          return undoManager.canRedo();
        },
        COMMAND_PRIORITY_EDITOR,
      ),
    );

    return unregister;
  }, [editor, undoManager]);
}
