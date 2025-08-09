/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {createCommand} from 'lexical';
import type {LexicalCommand} from 'lexical';
import {UndoManager} from 'loro-crdt';
import type {Binding, LoroText, LoroUndoManager} from './Bindings';

export type {
  Binding,
  ClientID,
  Cursor,
  CursorSelection,
  ExcludedProperties,
  LoroMap,
  LoroText,
  LoroUndoManager,
} from './Bindings';

export type UserState = {
  anchorPos: null | number;
  color: string;
  focusing: boolean;
  focusPos: null | number;
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

export interface Provider {
  awareness: {
    getLocalState(): object | null;
    setLocalState(state: object): void;
    getStates(): Map<number, object>;
    off(type: string, listener: (arg: {states: Map<number, object>}) => void): void;
    on(type: string, listener: (arg: {states: Map<number, object>}) => void): void;
  };
  connect(): void;
  disconnect(): void;
  off(type: 'reload', cb: (doc: unknown) => void): void;
  off(type: 'status', cb: (arg: {status: string}) => void): void;
  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'update', cb: (update: Uint8Array, origin: unknown) => void): void;
  on(type: 'reload', cb: (doc: unknown) => void): void;
  on(type: 'status', cb: (arg: {status: string}) => void): void;
  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'update', cb: (update: Uint8Array, origin: unknown) => void): void;
}

export type Operation = {
  attributes: {
    __type: string;
  };
  insert: string | Record<string, unknown>;
};

export type Delta = Array<Operation>;
export type LoroNode = Record<string, unknown>;
export type LoroEvent = Record<string, unknown>;
export {createBinding} from './Bindings';

export function createUndoManager(
  binding: Binding,
  _root: LoroText,
): LoroUndoManager {
  return new UndoManager(binding.doc, {});
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
  let localState = awareness.getLocalState() as UserState | null;

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
  $syncLexicalUpdateToLoro,
  syncLoroChangesToLexical,
} from './SyncEditorStates';

// Export WebSocket provider for Loro collaboration
export { LoroWebsocketProvider, type LoroWebsocketProviderOptions } from './example/loro-ws-provider';
export { createLoroProvider } from './example/providers';
export { createMockLoroProvider } from './example/mock-provider';
