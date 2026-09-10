/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * The people in a document's room, as its awareness says: who they are,
 * whether their caret is in the document, and whether they have some of it
 * selected. What a host shows beside the editor — a collaboration rail —
 * reads this rather than the cursors the editor paints.
 */

import type { Cursor } from 'loro-crdt';
import type { UserState } from './State';
import { getDisplayNameFromAwareness } from './sync/SyncCursors';

export type Collaborator = {
  clientId: number;
  /** The platform identity the host put in the awareness, when it did. */
  uid?: string;
  name: string;
  color: string;
  isCurrentUser: boolean;
  /** Their caret is in the document. */
  focusing: boolean;
  /** They have some of the document selected, not only a caret. */
  selecting: boolean;
};

const sameCursor = (a: Cursor, b: Cursor): boolean => {
  const left = a.encode();
  const right = b.encode();
  return (
    left.length === right.length &&
    left.every((byte, index) => byte === right[index])
  );
};

const uidOf = (state: UserState): string | undefined => {
  const data = state.awarenessData as Record<string, unknown> | undefined;
  const user =
    data && data.user && typeof data.user === 'object'
      ? (data.user as Record<string, unknown>)
      : undefined;
  const uid = user?.id ?? user?.uid;
  return typeof uid === 'string' && uid.length > 0 ? uid : undefined;
};

/** The collaborators of a room, the local one first. */
export function collaboratorsOf(
  states: Map<number, UserState>,
  localClientID: number,
): Array<Collaborator> {
  const collaborators: Array<Collaborator> = [];
  for (const [clientId, state] of states) {
    const anchor = state.anchorPos;
    const focus = state.focusPos;
    collaborators.push({
      clientId,
      uid: uidOf(state),
      name: getDisplayNameFromAwareness(state),
      color: state.color,
      isCurrentUser: clientId === localClientID,
      focusing: Boolean(state.focusing),
      selecting: anchor !== null && focus !== null && !sameCursor(anchor, focus),
    });
  }
  return collaborators.sort(
    (a, b) =>
      Number(b.isCurrentUser) - Number(a.isCurrentUser) ||
      a.clientId - b.clientId,
  );
}
