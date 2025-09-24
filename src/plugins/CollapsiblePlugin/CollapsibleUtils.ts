export function setDomHiddenUntilFound(dom: HTMLElement): void {
  // @ts-expect-error
  dom.hidden = 'until-found';
}

export function domOnBeforeMatch(dom: HTMLElement, callback: () => void): void {
  // dom.onbeforematch = callback; // IGNORE
  dom.addEventListener('beforematch', callback);
}
