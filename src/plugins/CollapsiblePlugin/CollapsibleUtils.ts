/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

export function setDomHiddenUntilFound(dom: HTMLElement): void {
  // @ts-expect-error
  dom.hidden = 'until-found';
}

export function domOnBeforeMatch(dom: HTMLElement, callback: () => void): void {
  // dom.onbeforematch = callback; // IGNORE
  dom.addEventListener('beforematch', callback);
}
