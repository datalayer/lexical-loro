/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroBinding } from './LoroBinding';
import type { LoroTree } from 'loro-crdt';
import type { LexicalCommand } from 'lexical';

import { createCommand } from 'lexical';

// Commands (following YJS pattern)
export const LORO_CONNECTED_COMMAND: LexicalCommand<boolean> =
  createCommand('LORO_CONNECTED_COMMAND');

export const LORO_TOGGLE_CONNECT_COMMAND: LexicalCommand<boolean> =
  createCommand('LORO_TOGGLE_CONNECT_COMMAND');

// Undo Manager interface (following YJS pattern)
export interface LoroUndoManager {
  undo(): void;
  redo(): void;
  clear(): void;
  // TODO: Add event methods when Loro supports them
  // on(event: string, callback: () => void): void;
  // off(event: string, callback: () => void): void;
}

/**
 * Create Loro undo manager (equivalent to YJS createUndoManager)
 * 
 * This will integrate with Loro's undo/redo system when available
 */
export function createLoroUndoManager(
  _binding: LoroBinding, // eslint-disable-line @typescript-eslint/no-unused-vars
  _root: LoroTree, // eslint-disable-line @typescript-eslint/no-unused-vars
): LoroUndoManager {
  console.log('📚 Creating Loro undo manager');
  
  // TODO: Implement when Loro provides undo manager API
  return {
    undo: () => {
      console.log('↶ Undo operation (placeholder)');
      // TODO: Implement Loro undo
    },
    redo: () => {
      console.log('↷ Redo operation (placeholder)');
      // TODO: Implement Loro redo
    },
    clear: () => {
      console.log('🗑️ Clear history (placeholder)');
      // TODO: Implement Loro clear history
    },
  };
}
