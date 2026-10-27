/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * The Loro transport, for the `ws` server (Node): its rooms. A new room
 * starts empty; the server's caller seeds it (`setRoomSeeder`), as the
 * Lexical server does with Lexical content.
 */

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
