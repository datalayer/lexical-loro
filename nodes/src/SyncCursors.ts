/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type {Binding, Cursor} from './Bindings';
import type {LexicalNode,NodeKey} from 'lexical';

import {createDOMRange, createRectsFromDOMRange} from '@lexical/selection';
import {
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import invariant from './shared/invariant';

import {Provider, UserState} from '.';
import {CollabDecoratorNode} from './CollabDecoratorNode';
import {CollabElementNode} from './CollabElementNode';
import {CollabLineBreakNode} from './CollabLineBreakNode';
import {CollabTextNode} from './CollabTextNode';
import {getPositionFromElementAndOffset} from './Utils';

type SimplePoint = {
  key: NodeKey;
  offset: number;
  type: 'text' | 'element';
  getNode: () => LexicalNode;
};

export type SyncCursorPositionsFn = (
  binding: Binding,
  provider: Provider,
  cursorsContainer: HTMLElement,
) => void;

function createAbsolutePosition(
  point: SimplePoint,
  binding: Binding,
): null | number {
  const collabNodeMap = binding.collabNodeMap;
  const collabNode = collabNodeMap.get(point.key);

  if (collabNode === undefined) {
    return null;
  }

  let offset = point.offset;

  if (collabNode instanceof CollabTextNode) {
    const currentOffset = collabNode.getOffset();

    if (currentOffset === -1) {
      return null;
    }

    offset = currentOffset + 1 + offset;
  } else if (
    collabNode instanceof CollabElementNode &&
    point.type === 'element'
  ) {
    const parent = point.getNode();
    invariant($isElementNode(parent), 'Element point must be an element node');
    let accumulatedOffset = 0;
    let i = 0;
    let node = parent.getFirstChild();
    while (node !== null && i++ < offset) {
      if ($isTextNode(node)) {
        accumulatedOffset += node.getTextContentSize() + 1;
      } else {
        accumulatedOffset++;
      }
      node = node.getNextSibling();
    }
    offset = accumulatedOffset;
  }

  return offset;
}

function createPointFromAbsolutePosition(
  absolutePosition: number,
  binding: Binding,
): null | SimplePoint {
  const root = binding.root;
  const {length, node} = getPositionFromElementAndOffset(
    root,
    absolutePosition,
    false,
  );

  if (node instanceof CollabTextNode) {
    const lexicalNode = node.getNode();
    invariant($isTextNode(lexicalNode), 'Expected text node');
    return {
      getNode: () => lexicalNode,
      key: lexicalNode.__key,
      offset: length,
      type: 'text',
    };
  } else if (node instanceof CollabElementNode) {
    const lexicalNode = node.getNode();
    invariant($isElementNode(lexicalNode), 'Expected element node');
    return {
      getNode: () => lexicalNode,
      key: lexicalNode.__key,
      offset: length,
      type: 'element',
    };
  } else if (node instanceof CollabLineBreakNode) {
    const lexicalNode = node.getNode();
    invariant($isLineBreakNode(lexicalNode), 'Expected linebreak node');
    return {
      getNode: () => lexicalNode,
      key: lexicalNode.__key,
      offset: 0,
      type: 'element',
    };
  }

  return null;
}

export function $syncLexicalSelectionToLoro(
  binding: Binding,
  provider: Provider,
  name: string,
  color: string,
  awarenessData: object,
): void {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const anchorPosition = createAbsolutePosition(selection.anchor, binding);
    const focusPosition = createAbsolutePosition(selection.focus, binding);

    if (anchorPosition !== null && focusPosition !== null) {
      const {awareness} = provider;
      const localState = awareness.getLocalState() as UserState | null;

      if (localState !== null) {
        localState.anchorPos = anchorPosition;
        localState.focusPos = focusPosition;
        localState.awarenessData = awarenessData;
        localState.color = color;
        localState.name = name;
        awareness.setLocalState(localState);
      }
    }
  }
}
/** @deprecated renamed to {@link $syncLexicalSelectionToLoro} by @lexical/eslint-plugin rules-of-lexical */
export const syncLexicalSelectionToLoro = $syncLexicalSelectionToLoro;

export function $syncLocalCursorPosition(
  binding: Binding,
  provider: Provider,
): void {
  const awareness = provider.awareness;
  const localState: UserState | null = awareness.getLocalState() as UserState | null;

  if (localState === null) {
    return;
  }

  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const anchorPosition = createAbsolutePosition(selection.anchor, binding);
    const focusPosition = createAbsolutePosition(selection.focus, binding);

    if (
      anchorPosition !== null &&
      focusPosition !== null &&
      (localState.anchorPos !== anchorPosition ||
        localState.focusPos !== focusPosition)
    ) {
      localState.anchorPos = anchorPosition;
      localState.focusPos = focusPosition;
      awareness.setLocalState(localState);
    }
  }
}

export function $syncCursorPositions(
  binding: Binding,
  provider: Provider,
  cursorsContainer: HTMLElement,
): void {
  const awareness = provider.awareness;
  const localClientID = binding.clientID;
  const cursors = binding.cursors;
  const states = awareness.getStates() as Map<number, UserState>;

  for (const [clientID, state] of states) {
    const clientIDStr = String(clientID);
    if (clientIDStr === String(localClientID)) {
      continue;
    }

    const {anchorPos, focusPos, name, color, focusing} = state as UserState;
    const hasCursor = cursors.has(clientIDStr);

    if (!focusing) {
      if (hasCursor) {
        const cursor = cursors.get(clientIDStr);
        invariant(cursor !== undefined, 'Cursor not found');
        const cursorSelection = cursor.selection;

        if (cursorSelection !== null) {
          const {selections} = cursorSelection;

          for (let i = 0; i < selections.length; i++) {
            const selectionEl = selections[i];
            selectionEl.remove();
          }
        }

        cursors.delete(clientIDStr);
      }

      continue;
    }

    if (anchorPos === null || focusPos === null) {
      continue;
    }

    const anchorPoint = createPointFromAbsolutePosition(anchorPos, binding);
    const focusPoint = createPointFromAbsolutePosition(focusPos, binding);

    if (anchorPoint === null || focusPoint === null) {
      continue;
    }

    let cursor = cursors.get(clientIDStr);

    if (!hasCursor) {
      cursor = {
        color,
        name: name || 'Anonymous',
        selection: null,
      };
      if (cursor) {
        cursors.set(clientIDStr, cursor);
      }
    } else {
      cursor = cursors.get(clientIDStr);
      if (!cursor) {
        continue;
      }
    }

    // Update cursor position if needed
    const lexicalSelection = $getSelection();
    
    if ($isRangeSelection(lexicalSelection)) {
      try {
        const range = createDOMRange(
          binding.editor,
          anchorPoint.getNode(),
          anchorPoint.offset,
          focusPoint.getNode(),
          focusPoint.offset,
        );

        if (range !== null && cursor) {
          const rects = createRectsFromDOMRange(binding.editor, range);
          updateCursorSelections(cursor, cursorsContainer, rects, color, name);
        }
      } catch (error) {
        // Ignore range creation errors
      }
    }
  }
}
/** @deprecated renamed to {@link $syncCursorPositions} by @lexical/eslint-plugin rules-of-lexical */
export const syncCursorPositions = $syncCursorPositions;

function updateCursorSelections(
  cursor: Cursor,
  cursorsContainer: HTMLElement,
  rects: Array<DOMRect>,
  color: string,
  name: string,
): void {
  const existingSelections = cursor.selection ? cursor.selection.selections : [];
  
  // Remove extra selections
  for (let i = rects.length; i < existingSelections.length; i++) {
    existingSelections[i].remove();
  }

  // Update or create selections
  const newSelections: Array<HTMLElement> = [];
  
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    let selection = existingSelections[i];
    
    if (!selection) {
      selection = document.createElement('div');
      selection.style.position = 'absolute';
      selection.style.pointerEvents = 'none';
      selection.style.userSelect = 'none';
      selection.style.zIndex = '1000';
      cursorsContainer.appendChild(selection);
    }
    
    selection.style.backgroundColor = color;
    selection.style.opacity = '0.3';
    selection.style.left = rect.left + 'px';
    selection.style.top = rect.top + 'px';
    selection.style.width = rect.width + 'px';
    selection.style.height = rect.height + 'px';
    
    newSelections.push(selection);
  }

  // Create caret element
  let caret = cursor.selection ? cursor.selection.caret : null;
  if (!caret && rects.length > 0) {
    caret = document.createElement('div');
    caret.style.position = 'absolute';
    caret.style.pointerEvents = 'none';
    caret.style.userSelect = 'none';
    caret.style.width = '2px';
    caret.style.zIndex = '1001';
    cursorsContainer.appendChild(caret);
  }

  if (caret && rects.length > 0) {
    const lastRect = rects[rects.length - 1];
    caret.style.backgroundColor = color;
    caret.style.left = (lastRect.left + lastRect.width) + 'px';
    caret.style.top = lastRect.top + 'px';
    caret.style.height = lastRect.height + 'px';
  }

  // Create name label
  let nameElement = cursor.selection ? cursor.selection.name : null;
  if (!nameElement && rects.length > 0) {
    nameElement = document.createElement('span');
    nameElement.style.position = 'absolute';
    nameElement.style.pointerEvents = 'none';
    nameElement.style.userSelect = 'none';
    nameElement.style.fontSize = '12px';
    nameElement.style.padding = '2px 4px';
    nameElement.style.borderRadius = '2px';
    nameElement.style.zIndex = '1002';
    cursorsContainer.appendChild(nameElement);
  }

  if (nameElement && rects.length > 0) {
    const firstRect = rects[0];
    nameElement.style.backgroundColor = color;
    nameElement.style.color = 'white';
    nameElement.style.left = firstRect.left + 'px';
    nameElement.style.top = (firstRect.top - 20) + 'px';
    nameElement.textContent = name;
  }

  cursor.selection = {
    anchor: { key: '', offset: 0 },
    caret: caret!,
    color,
    focus: { key: '', offset: 0 },
    name: nameElement!,
    selections: newSelections,
  };
}

export function getAnchorAndFocusCollabNodesForUserState(
  userState: UserState,
  binding: Binding,
): {
  anchorCollabNode: null | CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode;
  focusCollabNode: null | CollabElementNode | CollabTextNode | CollabDecoratorNode | CollabLineBreakNode;
} {
  const {anchorPos, focusPos} = userState;
  
  if (anchorPos === null || focusPos === null) {
    return {
      anchorCollabNode: null,
      focusCollabNode: null,
    };
  }

  const anchorPoint = createPointFromAbsolutePosition(anchorPos, binding);
  const focusPoint = createPointFromAbsolutePosition(focusPos, binding);

  if (anchorPoint === null || focusPoint === null) {
    return {
      anchorCollabNode: null,
      focusCollabNode: null,
    };
  }

  const collabNodeMap = binding.collabNodeMap;
  const anchorCollabNode = collabNodeMap.get(anchorPoint.key) || null;
  const focusCollabNode = collabNodeMap.get(focusPoint.key) || null;

  return {
    anchorCollabNode,
    focusCollabNode,
  };
}
