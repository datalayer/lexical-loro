/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * Assert a collaboration invariant.
 *
 * The Loro <-> Lexical sync engine relies on a set of structural invariants
 * (a node's parent is already mapped, an insertion index is within range, a
 * text node always has a parent, ...). When one of these does not hold the
 * engine is in a state it cannot resolve correctly.
 *
 * Historically such cases were "handled" by logging a warning and skipping the
 * operation (or clamping an index). That silently corrupts the shared document
 * and hides the underlying bug. Instead we throw: the failure surfaces
 * immediately, the surrounding `editor.update()` rolls back cleanly, and the
 * root cause can be found and fixed rather than masked.
 */
export function invariant(
  condition: unknown,
  message: string,
  context?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    const details = context ? ` ${JSON.stringify(context)}` : '';
    throw new Error(`[loro-collab] Invariant failed: ${message}${details}`);
  }
}
