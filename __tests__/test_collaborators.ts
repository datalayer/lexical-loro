/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { Cursor } from 'loro-crdt';
import { collaboratorsOf } from '../src/collab/loro/collaborators';
import type { UserState } from '../src/collab/loro/State';

/** A Loro cursor, as far as telling two apart needs one. */
const cursor = (bytes: number[]): Cursor =>
  ({ encode: () => Uint8Array.from(bytes) }) as unknown as Cursor;

const state = (fields: Partial<UserState>): UserState => ({
  anchorPos: null,
  focusPos: null,
  color: 'rgb(0, 0, 0)',
  focusing: false,
  name: 'Cat-1234',
  awarenessData: {},
  ...fields,
});

describe('collaboratorsOf', () => {
  test('names each person as the host identified them, the local one first', () => {
    const states = new Map<number, UserState>([
      [
        7,
        state({
          name: 'Fox-7',
          awarenessData: { user: { id: 'u-grace', display_name: 'Grace Hopper' } },
          focusing: true,
          anchorPos: cursor([1, 2]),
          focusPos: cursor([1, 9]),
        }),
      ],
      [
        3,
        state({
          name: 'Owl-3',
          awarenessData: { user: { id: 'u-ada', name: 'ada' } },
          focusing: true,
          anchorPos: cursor([4]),
          focusPos: cursor([4]),
        }),
      ],
      [5, state({ name: 'Cat-5' })],
    ]);
    expect(collaboratorsOf(states, 3)).toEqual([
      { clientId: 3, uid: 'u-ada', name: 'ada', color: 'rgb(0, 0, 0)', isCurrentUser: true, focusing: true, selecting: false },
      { clientId: 5, uid: undefined, name: 'Cat-5', color: 'rgb(0, 0, 0)', isCurrentUser: false, focusing: false, selecting: false },
      { clientId: 7, uid: 'u-grace', name: 'Grace Hopper', color: 'rgb(0, 0, 0)', isCurrentUser: false, focusing: true, selecting: true },
    ]);
  });

  test('a caret alone is not a selection, and nobody in the room is nobody', () => {
    const caret = state({ focusing: true, anchorPos: cursor([2, 2]), focusPos: cursor([2, 2]) });
    expect(collaboratorsOf(new Map([[1, caret]]), 9)[0].selecting).toBe(false);
    expect(collaboratorsOf(new Map(), 9)).toEqual([]);
  });
});
