/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * The Loro transport: the WebSocket provider and its awareness, and the
 * room handling of the `ws` server. It imports no Lexical: Lexical documents
 * and Cells workbooks both connect through it. A new room starts empty; the
 * server's caller seeds it (`setRoomSeeder`), as the Lexical server does
 * with Lexical content.
 */

export * from './types';
export * from './ids';
export { debugLog, isDebugEnabled } from './debug';
export * from './websocket';
export {
  docs,
  getDoc,
  getPersistence,
  setPersistence,
  setRoomSeeder,
  setupWSConnection,
  WSSharedDoc,
  type RoomSeeder,
} from './rooms';
