/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroDoc } from 'loro-crdt';

/**
 * The client id of a document: its Loro peer id, as a number.
 */
export function generateClientID(doc: LoroDoc): number {
  return Number(doc.peerId);
}

/**
 * A client id for cases where no document is available: a random id within
 * the safe integer range.
 */
export function generateRandomClientID(): number {
  return Math.floor(Math.random() * 2147483647);
}
