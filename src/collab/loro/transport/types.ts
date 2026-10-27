/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * The awareness and provider shapes the transport speaks: no Lexical in
 * them, so another editor (a spreadsheet) uses the same transport.
 */

import type { Cursor, LoroDoc } from 'loro-crdt';

export type UserState = {
  anchorPos: Cursor | null;
  color: string;
  focusing: boolean;
  focusPos: Cursor | null;
  name: string;
  awarenessData: object;
  [key: string]: unknown;
};

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
