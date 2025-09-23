import type {LexicalCommand} from 'lexical';
import {createCommand} from 'lexical';
import type {LoroDoc, Cursor} from 'loro-crdt';
import {UndoManager} from 'loro-crdt';
import type {Binding} from './Bindings';

export type UserState = {
  anchorPos: Cursor | null;
  color: string;
  focusing: boolean;
  focusPos: Cursor | null;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
};

export const CONNECTED_COMMAND: LexicalCommand<boolean> =
  createCommand('CONNECTED_COMMAND');

export const TOGGLE_CONNECT_COMMAND: LexicalCommand<boolean> =
  createCommand('TOGGLE_CONNECT_COMMAND');

export type AwarenessProvider = {
  getLocalState: () => UserState | null;
  getStates: () => Map<number, UserState>;
  off: (type: 'update', cb: () => void) => void;
  on: (type: 'update', cb: () => void) => void;
  setLocalState: (userState: UserState) => void;
  setLocalStateField: (field: string, value: unknown) => void;
};

export type Provider = {
  awareness: AwarenessProvider;
  connect(): void | Promise<void>;
  disconnect(): void;
  off(type: 'sync', cb: (isSynced: boolean) => void): void;
  off(type: 'update', cb: (update: unknown) => void): void;
  off(type: 'status', cb: (status: {status: string}) => void): void;
  off(type: 'reload', cb: (doc: LoroDoc) => void): void;
  on(type: 'sync', cb: (isSynced: boolean) => void): void;
  on(type: 'status', cb: (status: {status: string}) => void): void;
  on(type: 'update', cb: (update: unknown) => void): void;
  on(type: 'reload', cb: (doc: LoroDoc) => void): void;
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

export function createUndoManager(
  binding: Binding,
): UndoManager {
  
  // Create Loro UndoManager with configuration
  const undoManager = new UndoManager(binding.doc, {
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
        value: binding.doc.toJSON(), // Save document state
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

  // Always update name and color in case they changed
  localState.name = name;
  localState.color = color;
  localState.focusing = focusing;
  awareness.setLocalState(localState);
}

export function updateLocalStateName(
  provider: Provider,
  name: string,
  color: string,
): void {
  const {awareness} = provider;
  let localState = awareness.getLocalState();

  if (localState === null) {
    // Initialize with the new name if no state exists
    localState = {
      anchorPos: null,
      awarenessData: {},
      color,
      focusPos: null,
      focusing: false,
      name,
    };
  } else {
    // Update existing state with new name and color
    localState.name = name;
    localState.color = color;
  }

  awareness.setLocalState(localState);
}
