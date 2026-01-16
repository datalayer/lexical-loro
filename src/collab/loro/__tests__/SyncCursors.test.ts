/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { createEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';

describe('SyncCursors', () => {
  describe('Cursor synchronization (TODO - implement last)', () => {
    it.todo('synchronizes cursor position between clients');
    it.todo('handles cursor updates from Loro awareness');
    it.todo('cleans up cursor when client disconnects');
    it.todo('handles multiple cursors from different users');
    it.todo('updates cursor on selection change');
  });

  describe('Selection serialization (TODO)', () => {
    it.todo('serializes Lexical selection to Loro format');
    it.todo('deserializes Loro cursor to Lexical selection');
    it.todo('handles collapsed selections (cursor)');
    it.todo('handles range selections');
    it.todo('handles node selections');
  });

  describe('Awareness integration (TODO)', () => {
    it.todo('publishes local cursor to awareness');
    it.todo('subscribes to remote cursor changes');
    it.todo('renders remote cursors in editor');
    it.todo('updates cursor color per user');
  });
});
