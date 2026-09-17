/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import * as React from 'react';
import type {JSX} from 'react';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {createPortal} from 'react-dom';
import type {LexicalEditor} from 'lexical';
import {mergeRegister} from '@lexical/utils';
import {
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  $createParagraphNode,
  FOCUS_COMMAND,
  $getNodeByKey,
  $getRoot,
  HISTORY_MERGE_TAG,
  $parseSerializedNode,
  REDO_COMMAND,
  $setSelection,
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
import { syncLexicalToLoro } from './sync/SyncLexicalToLoro';
import { syncLoroToLexical } from './sync/SyncLoroToLexical';
import { syncCursorPositions, SyncCursorPositionsFn } from './sync/SyncCursors';
import { debugLog } from './Debug';

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
  onInitialization?: (isInitialized: boolean) => void,
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
    const {awareness} = provider;

    const onStatus = ({status}: {status: string}) => {
      editor.dispatchCommand(CONNECTED_COMMAND, status === 'connected');
    };

    // Nothing local reaches Loro before the room has said what it holds.
    // Lexical commits its initial state — a root and an empty paragraph — as
    // soon as the editor mounts; propagating that before the snapshot minted
    // a second root in the shared tree, and whatever this pane then wrote
    // under it could never be placed by the other peer. Once the snapshot is
    // in, that pre-sync content gives way to the document.
    let hasSynced = false;

    const onSync = (isSynced: boolean) => {
      if (isSynced && !hasSynced) {
        hasSynced = true;
        dropUnsyncedContent(editor, binding, initialEditorState);
      }
      debugLog('[SEED-DEBUG] onSync: isSynced=', isSynced, 'shouldBootstrap=', shouldBootstrap, 'isReloadingDoc=', isReloadingDoc.current);
      if (
        shouldBootstrap &&
        isSynced &&
        isReloadingDoc.current === false
      ) {
        initializeEditor(editor, initialEditorState);
        
        // Call the initialization callback after initializing the editor
        if (onInitialization) {
          onInitialization(true);
        }
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

    const onLoroUpdates = (eventBatch: LoroEventBatch) => {
      // Only skip if the origin is from this specific editor's changes.
      // We set 'lexical-edit' as origin when making changes from this editor.
      // So we should skip only if the origin is 'lexical-edit' (our own changes).

      if (eventBatch.origin !== binding.doc.peerIdStr) {
        // Check if this change is from the undo manager
        // const isFromUndoManger = origin instanceof UndoManager;
        const isFromUndoManager = false;
        syncLoroToLexical(
          binding,
          provider,
          eventBatch,
          isFromUndoManager,
          syncCursorPositionsFn,
        );
      }
    };
    // This updates the local editor state when we receive updates from other clients.
    const unsubscribe = binding.doc.subscribe(onLoroUpdates);

    // Lexical only includes a node type in `update.mutatedNodes` when that type
    // has at least one registered mutation listener. Our Lexical→Loro sync
    // relies entirely on `mutatedNodes`, so any node type without a listener is
    // invisible to collaboration. In particular, the bootstrap seed runs before
    // other plugins mount and register their own mutation listeners, so its
    // commits produced an empty `mutatedNodes` and never propagated to peers.
    // Register a no-op mutation listener for every node type registered on this
    // editor so `mutatedNodes` is always fully populated (this mirrors how the
    // Yjs binding stays independent of other plugins).
    const mutationListenerCleanups: Array<() => void> = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registeredNodes = (editor as any)._nodes as
      | Map<string, {klass: any}>
      | undefined;
    debugLog(
      '[SEED-DEBUG] registering mutation listeners; registeredNodes=',
      registeredNodes ? registeredNodes.size : 'undefined',
    );
    if (registeredNodes) {
      registeredNodes.forEach((registered) => {
        if (registered && registered.klass) {
          mutationListenerCleanups.push(
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            editor.registerMutationListener(registered.klass, () => {}, {
              skipInitialization: true,
            }),
          );
        }
      });
    }
    debugLog(
      '[SEED-DEBUG] mutation listeners registered=',
      mutationListenerCleanups.length,
      'editor._listeners.mutation.size=',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor as any)._listeners?.mutation?.size,
    );

    const removeListener = editor.registerUpdateListener(
      (update) => {
        let __mn = 0;
        if (update.mutatedNodes) {
          update.mutatedNodes.forEach((m) => {
            __mn += m.size;
          });
        }
        debugLog(
          '[SEED-DEBUG] updateListener fired; tags=',
          Array.from(update.tags),
          'mutatedNodes=',
          update.mutatedNodes ? 'map' : 'null',
          'count=',
          __mn,
          'dirtyElements=',
          update.dirtyElements?.size,
          'dirtyLeaves=',
          update.dirtyLeaves?.size,
        );
        if (hasSynced && update.tags.has(SKIP_COLLAB_TAG) === false) {
          syncLexicalToLoro(
            binding,
            provider,
            update,
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
      mutationListenerCleanups.forEach((cleanup) => cleanup());
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
    onInitialization,
  ]);
  const cursorsContainer = useMemo(() => {
    const ref = (element: null | HTMLElement) => {
      binding.cursorsContainer = element;
    };

    return createPortal(
      <div ref={ref} style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'visible',
      }} />,
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
    () => createUndoManager(binding),
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

/**
 * Remove what the editor held before the snapshot arrived.
 *
 * Every node the snapshot brought is mapped; a child of the root without a
 * mapping is the initial state Lexical committed on mount, which never went to
 * the room. The document wins. A room that is empty and will not be seeded by
 * this pane still gets one paragraph, as the Yjs binding gives it, so there is
 * somewhere to type. That paragraph stays this pane's own: it is not sent, so
 * two panes joining an empty room together do not each put a root in it. The
 * first keystroke into it sends it, root and all; and if another pane's root
 * arrives first, the integrator drops it for the document.
 */
function dropUnsyncedContent(
  editor: LexicalEditor,
  binding: Binding,
  initialEditorState?: InitialEditorStateType,
): void {
  editor.update(
    () => {
      const root = $getRoot();
      for (const child of root.getChildren()) {
        if (!binding.nodeMapper.hasLexicalMapping(child.getKey())) {
          child.remove();
        }
      }
      if (root.isEmpty() && !initialEditorState) {
        root.append($createParagraphNode());
      }
    },
    {discrete: true, tag: SKIP_COLLAB_TAG},
  );
}

function initializeEditor(
  editor: LexicalEditor,
  initialEditorState?: InitialEditorStateType,
): void {
  // Text used by the server-side default scaffold that fresh rooms are
  // pre-seeded with. When a room only contains this scaffold it should be
  // treated as empty so the host app's real initial content can replace it.
  const PLACEHOLDER_TEXTS = new Set([
    'Lexical with Loro',
    'Welcome to Lexical with Loro',
    'Type something...',
  ]);

  const hasMeaningfulContent = (): boolean => {
    const root = $getRoot();
    const children = root.getChildren();

    if (children.length === 0) {
      return false;
    }

    for (const child of children) {
      const type = child.getType();
      const text = child.getTextContent().trim();

      if (text.length > 0) {
        // Ignore the known default scaffold text so it can be overwritten by
        // the host app's initial content on a freshly created room.
        if (!PLACEHOLDER_TEXTS.has(text)) {
          return true;
        }
        continue;
      }

      // Ignore known scaffold placeholders used by some host apps before
      // collaboration bootstrap fills the real initial document.
      if (type !== 'paragraph' && type !== 'jupyter-output') {
        return true;
      }
    }

    return false;
  };

  // Only seed a room whose sole content is the (empty/scaffold) default.
  let shouldSeed = false;
  editor.getEditorState().read(() => {
    shouldSeed = !hasMeaningfulContent();
  });
  debugLog('[SEED-DEBUG] initializeEditor: shouldSeed=', shouldSeed, 'hasInitialState=', !!initialEditorState, 'type=', typeof initialEditorState);
  if (!shouldSeed || !initialEditorState) {
    return;
  }

  // Preferred path: a serialized editor state (string). Seed it INCREMENTALLY,
  // exactly as a human collaborator would build the document — append each
  // top-level block in its own commit, then remove the scaffold blocks one by
  // one. Each small, well-formed commit produces clean per-node "created"
  // mutations that the Loro binding propagates reliably. A single bulk
  // clear()+append emitted one large, malformed batch that failed to integrate
  // on remote peers (inline nodes arriving without a resolved parent), which is
  // why the second editor never received the initial content.
  if (typeof initialEditorState === 'string') {
    let serializedChildren: unknown[] = [];
    try {
      const serialized = JSON.parse(initialEditorState);
      serializedChildren = serialized?.root?.children ?? [];
    } catch (error) {
      // Not a rebuildable serialized state → fall back to a whole-state swap.
      editor.update(
        () => {
          editor.setEditorState(editor.parseEditorState(initialEditorState), {
            tag: HISTORY_MERGE_TAG,
          });
        },
        {tag: HISTORY_MERGE_TAG},
      );
      return;
    }

    // IMPORTANT: every seed update below is committed with `discrete: true`.
    // The remote snapshot import runs `editor.update({tag: SKIP_COLLAB_TAG})`
    // and that update is still queued when this bootstrap runs. Without
    // `discrete`, Lexical coalesces the queued remote update together with our
    // seed updates into a single reconciliation and unions their tags, so the
    // seed batch inherits `skip-collab` and the collab sync ignores it. A
    // leading discrete no-op flushes the pending remote (skip-collab) update on
    // its own, and each discrete seed update then commits as its own
    // reconciliation carrying only `history-merge`, so it propagates to peers.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    editor.update(() => {}, {tag: HISTORY_MERGE_TAG, discrete: true});

    // Clear any pending selection first: it may point at scaffold nodes we are
    // about to remove, which would otherwise crash selection-reading plugins
    // (e.g. the typeahead menu).
    editor.update(
      () => {
        $setSelection(null);
      },
      {tag: HISTORY_MERGE_TAG, discrete: true},
    );

    // Capture the scaffold blocks AFTER the leading discrete flush, so any
    // late-arriving remote scaffold nodes are included. We remove them BEFORE
    // appending the real content: the scaffold's position in the Loro tree does
    // not necessarily line up with its Lexical index, so appending after it
    // makes the computed Loro insertion index drift out of range. Removing the
    // scaffold first leaves both trees at an aligned empty root, after which
    // each appended block sits at a matching index in Lexical and Loro.
    let scaffoldKeys: string[] = [];
    editor.getEditorState().read(() => {
      scaffoldKeys = $getRoot()
        .getChildren()
        .map(child => child.getKey());
    });

    debugLog('[SEED-DEBUG] initializeEditor: seeding', serializedChildren.length, 'blocks, removing', scaffoldKeys.length, 'scaffold blocks first');

    // Remove the scaffold blocks one by one so both trees reach an aligned
    // empty root before we append the real content.
    for (const key of scaffoldKeys) {
      editor.update(
        () => {
          const node = $getNodeByKey(key);
          if (node) {
            node.remove();
          }
        },
        {tag: HISTORY_MERGE_TAG, discrete: true},
      );
    }

    // Append the real content block by block into the now-empty, aligned root
    // (each commit ≈ one collaborator action).
    let __blockIndex = 0;
    for (const serializedNode of serializedChildren) {
      const __idx = __blockIndex++;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const __type = (serializedNode as any)?.type;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const __childTypes = Array.isArray((serializedNode as any)?.children)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (serializedNode as any).children.map((c: any) => c?.type)
        : [];
      editor.update(
        () => {
          const root = $getRoot();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          root.append($parseSerializedNode(serializedNode as any));
        },
        {tag: HISTORY_MERGE_TAG, discrete: true},
      );
      debugLog('[SEED-DEBUG] appended block', __idx, 'type=', __type, 'children=', __childTypes);
    }
    return;
  }

  // Non-string fallbacks (EditorState object or builder function).
  editor.update(
    () => {
      if (!hasMeaningfulContent()) {
        if (typeof initialEditorState === 'object') {
          editor.setEditorState(initialEditorState, {
            tag: HISTORY_MERGE_TAG,
          });
        } else if (typeof initialEditorState === 'function') {
          initialEditorState(editor);
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
