/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding} from './Bindings';
import type {LexicalCommand} from 'lexical';
import type {LoroDoc, Cursor} from 'loro-crdt';
import {UndoManager} from 'loro-crdt';
import type {LoroXmlText} from '../types/LoroXmlText';

import {createCommand} from 'lexical';

export type UserState = {
  anchorPos: null | Cursor;
  color: string;
  focusing: boolean;
  focusPos: null | Cursor;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
};
export const CONNECTED_COMMAND: LexicalCommand<boolean> =
  createCommand('CONNECTED_COMMAND');
export const TOGGLE_CONNECT_COMMAND: LexicalCommand<boolean> = createCommand(
  'TOGGLE_CONNECT_COMMAND',
);
export type ProviderAwareness = {
  getLocalState: () => UserState | null;
  getStates: () => Map<number, UserState>;
  off: (type: 'update', cb: () => void) => void;
  on: (type: 'update', cb: () => void) => void;
  setLocalState: (arg0: UserState) => void;
  setLocalStateField: (field: string, value: unknown) => void;
};
declare interface Provider {
  awareness: ProviderAwareness;
  connect(): void | Promise<void>;
  disconnect(): void;
  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'update', cb: (arg0: unknown) => void): void;
  off(type: 'status', cb: (arg0: {status: string}) => void): void;
  off(type: 'reload', cb: (doc: LoroDoc) => void): void;
  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'status', cb: (arg0: {status: string}) => void): void;
  on(type: 'update', cb: (arg0: unknown) => void): void;
  on(type: 'reload', cb: (doc: LoroDoc) => void): void;
}
export type Operation = {
  attributes: {
    __type: string;
  };
  insert: string | Record<string, unknown>;
};
export type Delta = Array<Operation>;
export type YjsNode = Record<string, unknown>;
export type YjsEvent = Record<string, unknown>;
export type {Provider};
export type {Binding, ClientID, ExcludedProperties} from './Bindings';
export {createBinding} from './Bindings';

export function createUndoManager(
  binding: Binding,
  root: LoroXmlText,
): UndoManager {
  const doc = root.getDoc();
  
  // Create Loro UndoManager with configuration
  const undoManager = new UndoManager(doc, {
    mergeInterval: 1000, // Merge operations within 1 second
    maxUndoSteps: 100,   // Keep up to 100 undo steps
    excludeOriginPrefixes: ['collab-', 'sync-'], // Exclude collaboration operations
    onPush: (isUndo, counterRange, event) => {
      // Save cursor positions when adding to undo stack
      const selection = binding.editor.getEditorState().read(() => {
        return binding.editor.getEditorState()._selection;
      });
      
      // Get cursors for the current state
      const cursors: Cursor[] = [];
      if (selection) {
        // TODO: Convert Lexical selection to Loro cursors
        // This would need to be implemented based on the specific selection format
      }
      
      return {
        value: doc.toJSON(), // Save document state
        cursors: cursors
      };
    },
    onPop: (isUndo, metadata, counterRange) => {
      // Restore cursor positions when undoing/redoing
      if (metadata?.cursors && metadata.cursors.length > 0) {
        binding.editor.update(() => {
          // TODO: Restore selection state from cursors
          // This would need to convert Loro cursors back to Lexical selection
        });
      }
    }
  });

  return undoManager;
}

export function initLocalState(
  provider: Provider,
  name: string,
  color: string,
  focusing: boolean,
  awarenessData: object,
): void {
  provider.awareness.setLocalState({
    anchorPos: null,
    awarenessData,
    color,
    focusPos: null,
    focusing: focusing,
    name,
  });
}

export function setLocalStateFocus(
  provider: Provider,
  name: string,
  color: string,
  focusing: boolean,
  awarenessData: object,
): void {
  const {awareness} = provider;
  let localState = awareness.getLocalState();

  if (localState === null) {
    localState = {
      anchorPos: null,
      awarenessData,
      color,
      focusPos: null,
      focusing: focusing,
      name,
    };
  }

  localState.focusing = focusing;
  awareness.setLocalState(localState);
}
export {
  getAnchorAndFocusCollabNodesForUserState,
  syncCursorPositions,
  type SyncCursorPositionsFn,
} from './SyncCursors';
export {
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from './SyncEditorStates';
