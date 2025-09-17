import type {LexicalCommand} from 'lexical';
import {createCommand} from 'lexical';
import type {Doc, RelativePosition, UndoManager, XmlText} from 'yjs';
import {UndoManager as CRDTUndoManager} from 'yjs';
import type {Binding} from './Bindings';

export type UserState = {
  anchorPos: RelativePosition | null;
  color: string;
  focusing: boolean;
  focusPos: RelativePosition | null;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
};

export const CONNECTED_COMMAND: LexicalCommand<boolean> =
  createCommand('CONNECTED_COMMAND');

export const TOGGLE_CONNECT_COMMAND: LexicalCommand<boolean> =
  createCommand('TOGGLE_CONNECT_COMMAND');

export type ProviderAwareness = {
  getLocalState: () => UserState | null;
  getStates: () => Map<number, UserState>;
  off: (type: 'update', cb: () => void) => void;
  on: (type: 'update', cb: () => void) => void;
  setLocalState: (userState: UserState) => void;
  setLocalStateField: (field: string, value: unknown) => void;
};

export type Provider = {
  awareness: ProviderAwareness;
  connect(): void | Promise<void>;
  disconnect(): void;
  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'update', cb: (arg0: unknown) => void): void;
  off(type: 'status', cb: (arg0: {status: string}) => void): void;
  off(type: 'reload', cb: (doc: Doc) => void): void;
  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'status', cb: (arg0: {status: string}) => void): void;
  on(type: 'update', cb: (arg0: unknown) => void): void;
  on(type: 'reload', cb: (doc: Doc) => void): void;
}

export type Operation = {
  attributes: {
    __type: string;
  };
  insert: string | Record<string, unknown>;
};

export type Delta = Array<Operation>;

export type CRDTNode = Record<string, unknown>;

export type CRDTEvent = Record<string, unknown>;

export function createUndoManager(
  binding: Binding,
  root: XmlText,
): UndoManager {
  return new CRDTUndoManager(root, {
    trackedOrigins: new Set([binding, null]),
  });
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
    focusing,
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
