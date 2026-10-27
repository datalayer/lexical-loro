/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

/**
 * Whether the collaboration code should say what it is doing: `?debug=true`
 * in the page's URL. Nothing in a Node process.
 */
let debugEnabled: boolean | undefined;

/**
 * Console output that is only wanted while debugging.
 *
 * The binding has a lot to say about what it sends, takes and maps; none of
 * it is for a page that works. With `?debug=true` it is all there; without,
 * the console carries warnings and errors alone.
 */
export function debugLog(...args: unknown[]): void {
  if (debugEnabled === undefined) {
    debugEnabled = isDebugEnabled();
  }
  if (debugEnabled) {
    console.log(...args);
  }
}

export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return new URLSearchParams(window.location.search).get('debug') === 'true';
}
