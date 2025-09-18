import type { BaseSelection, NodeKey } from 'lexical';
import type { Binding } from '../Bindings';
import { Provider, UserState } from '../State';

/*****************************************************************************/

export type CursorSelection = {
  anchor: {
    key: NodeKey;
    offset: number;
  };
  caret: HTMLElement;
  color: string;
  focus: {
    key: NodeKey;
    offset: number;
  };
  name: HTMLSpanElement;
  selections: Array<HTMLElement>;
};

export type Cursor = {
  color: string;
  name: string;
  selection: null | CursorSelection;
};

export type SyncCursorPositionsOptions = {
  getAwarenessStates?: (
    binding: Binding,
    provider: Provider,
  ) => Map<number, UserState>;
};

export type SyncCursorPositionsFn = (
  binding: Binding,
  provider: Provider,
  options?: SyncCursorPositionsOptions,
) => void;

/*****************************************************************************/

export function syncCursorPositions(
  binding: Binding,
  provider: Provider,
  options?: SyncCursorPositionsOptions,
): void {
  //
}

export function syncLexicalSelectionToLoro(
  binding: Binding,
  provider: Provider,
  prevSelection: null | BaseSelection,
  nextSelection: null | BaseSelection,
): void {
  //
}
