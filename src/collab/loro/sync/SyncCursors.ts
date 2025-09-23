import type { BaseSelection, NodeKey, Point, RangeSelection } from 'lexical';
import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';
import {createDOMRange, createRectsFromDOMRange} from '@lexical/selection';
import type { Cursor as LoroCursor, EphemeralStoreEvent } from 'loro-crdt';
import type { Binding } from '../Bindings';
import { Provider, UserState } from '../State';

/*****************************************************************************/

export type CursorSelection = {
  anchor: {
    key: NodeKey;
    offset: number;
  };
  caret: HTMLElement;
  color: string;
  focus: {
    key: NodeKey;
    offset: number;
  };
  name: HTMLSpanElement;
  selections: Array<HTMLElement>;
};

export type CollabCursor = {
  color: string;
  name: string;
  selection: null | CursorSelection;
};

export type SyncCursorPositionsOptions = {
  getAwarenessStates?: (
    binding: Binding,
    provider: Provider,
  ) => Map<number, UserState>;
};

export type SyncCursorPositionsFn = (
  binding: Binding,
  provider: Provider,
  options?: SyncCursorPositionsOptions,
) => void;

/*****************************************************************************/

// Helper function to convert a Lexical Point to a Loro Cursor
function convertLexicalPointToCursor(point: Point, binding: Binding): LoroCursor | null {
  try {
    const node = $getNodeByKey(point.key);
    if (!node) {
      return null;
    }

    // For text nodes, we need to find the corresponding text container in Loro tree
    if ($isTextNode(node)) {
      // Try to get cursor from text content at the specified offset
      const textContent = node.getTextContent();
      const offset = Math.min(point.offset, textContent.length);
      
      // TODO: Navigate Loro tree to find the correct text container
      // For now, create a simple cursor based on the node key and offset
      // This is a placeholder - in a full implementation, we'd need to:
      // 1. Find the Loro tree node corresponding to this Lexical node
      // 2. Get the text container within that node
      // 3. Create a cursor at the specified offset in that text container
      
      // Since we don't have the full tree navigation implemented yet,
      // we'll store the position information in a way that can be reconstructed
      return {
        nodeKey: point.key,
        offset: offset,
        type: 'text'
      } as any; // Temporary structure until we implement proper Loro Cursor creation
    }
    
    // For element nodes
    if ($isElementNode(node)) {
      return {
        nodeKey: point.key,
        offset: point.offset,
        type: 'element'
      } as any; // Temporary structure
    }

    return null;
  } catch (error) {
    console.warn('Failed to convert Lexical point to Loro cursor:', error);
    return null;
  }
}

// Helper function to convert Loro cursor data back to Lexical selection
function convertLoroSelectionToLexical(
  anchorCursor: LoroCursor | null,
  focusCursor: LoroCursor | null
): { anchorKey: NodeKey; anchorOffset: number; focusKey: NodeKey; focusOffset: number } | null {
  try {
    if (!anchorCursor || !focusCursor) {
      return null;
    }

    // TODO: Convert Loro Cursors back to Lexical node keys and offsets
    // For now, use the temporary structure we stored above
    const anchor = anchorCursor as any;
    const focus = focusCursor as any;

    return {
      anchorKey: anchor.nodeKey,
      anchorOffset: anchor.offset,
      focusKey: focus.nodeKey, 
      focusOffset: focus.offset,
    };
  } catch (error) {
    console.warn('Failed to convert Loro cursors to Lexical selection:', error);
    return null;
  }
}

// Helper function to set a point in Lexical selection
function $setPoint(point: Point, key: NodeKey, offset: number): void {
  if (point.key !== key || point.offset !== offset) {
    let anchorNode = $getNodeByKey(key);
    if (
      anchorNode !== null &&
      !$isElementNode(anchorNode) &&
      !$isTextNode(anchorNode)
    ) {
      const parent = anchorNode.getParentOrThrow();
      key = parent.getKey();
      offset = anchorNode.getIndexWithinParent();
      anchorNode = parent;
    }
    point.set(key, offset, $isElementNode(anchorNode) ? 'element' : 'text');
  }
}

// Helper functions for cursor UI management
function createCollabCursor(name: string, color: string): CollabCursor {
  return {
    color: color,
    name: name,
    selection: null,
  };
}

function createCursorSelection(
  cursor: CollabCursor,
  anchorKey: NodeKey,
  anchorOffset: number,
  focusKey: NodeKey,
  focusOffset: number,
): CursorSelection {
  const color = cursor.color;
  const caret = document.createElement('span');
  caret.style.cssText = `position:absolute;top:0;bottom:0;right:-1px;width:1px;background-color:${color};z-index:10;`;
  const name = document.createElement('span');
  name.textContent = cursor.name;
  name.style.cssText = `position:absolute;left:-2px;top:-16px;background-color:${color};color:#fff;line-height:12px;font-size:12px;padding:2px;font-family:Arial;font-weight:bold;white-space:nowrap;`;
  caret.appendChild(name);
  
  return {
    anchor: { key: anchorKey, offset: anchorOffset },
    focus: { key: focusKey, offset: focusOffset },
    caret,
    color: cursor.color,
    name,
    selections: [],
  };
}

function destroyCursor(binding: Binding, cursor: CollabCursor): void {
  const selection = cursor.selection;
  if (selection !== null) {
    destroySelection(binding, selection);
    cursor.selection = null;
  }
}

function destroySelection(binding: Binding, selection: CursorSelection): void {
  const cursorsContainer = binding.cursorsContainer;

  if (cursorsContainer !== null) {
    const selections = selection.selections;
    const selectionsLength = selections.length;

    for (let i = 0; i < selectionsLength; i++) {
      cursorsContainer.removeChild(selections[i]);
    }
  }
}

/*****************************************************************************/

export function syncCursorPositions(
  binding: Binding,
  provider: Provider,
  options?: SyncCursorPositionsOptions,
): void {
  const { getAwarenessStates = getAwarenessStatesDefault } = options ?? {};
  const awarenessStates = Array.from(getAwarenessStates(binding, provider));
  const localClientID = binding.clientID;
  const cursors = binding.cursors;
  const editor = binding.editor;
  const nodeMap = editor._editorState._nodeMap;
  const visitedClientIDs = new Set();

  // Process all remote cursor positions from awareness
  for (let i = 0; i < awarenessStates.length; i++) {
    const awarenessState = awarenessStates[i];
    const [clientID, awareness] = awarenessState;

    if (clientID !== localClientID) {
      visitedClientIDs.add(clientID);
      const { name, color, focusing } = awareness;
      let selection = null;

      let cursor = cursors.get(clientID);

      if (cursor === undefined) {
        cursor = createCollabCursor(name, color);
        cursors.set(clientID, cursor);
      }

      if (focusing) {
        const { anchorPos, focusPos } = awareness;

        if (anchorPos !== null && focusPos !== null) {
          const selectionInfo = convertLoroSelectionToLexical(anchorPos, focusPos);
          
          if (selectionInfo) {
            const { anchorKey, anchorOffset, focusKey, focusOffset } = selectionInfo;
            selection = cursor.selection;

            if (selection === null) {
              selection = createCursorSelection(
                cursor,
                anchorKey,
                anchorOffset,
                focusKey,
                focusOffset,
              );
            } else {
              // Update existing selection
              const anchor = selection.anchor;
              const focus = selection.focus;
              anchor.key = anchorKey;
              anchor.offset = anchorOffset;
              focus.key = focusKey;
              focus.offset = focusOffset;
            }
          }
        }
      }

      updateCursor(binding, cursor, selection, nodeMap);
    }
  }

  // Clean up cursors for clients that are no longer present
  const allClientIDs = Array.from(cursors.keys());

  for (let i = 0; i < allClientIDs.length; i++) {
    const clientID = allClientIDs[i];

    if (!visitedClientIDs.has(clientID)) {
      const cursor = cursors.get(clientID);

      if (cursor !== undefined) {
        destroyCursor(binding, cursor);
        cursors.delete(clientID);
      }
    }
  }
}

// Default function to get awareness states from provider
function getAwarenessStatesDefault(
  binding: Binding,
  provider: Provider,
): Map<number, UserState> {
  return provider.awareness.getStates();
}

// Function to update cursor visualization in the DOM
function updateCursor(
  binding: Binding,
  cursor: CollabCursor,
  nextSelection: CursorSelection | null,
  nodeMap: any, // LexicalEditor NodeMap type
): void {
  const editor = binding.editor;
  const rootElement = editor.getRootElement();
  const cursorsContainer = binding.cursorsContainer;

  if (cursorsContainer === null || rootElement === null) {
    return;
  }

  const cursorsContainerOffsetParent = cursorsContainer.offsetParent;
  if (cursorsContainerOffsetParent === null) {
    return;
  }

  const containerRect = cursorsContainerOffsetParent.getBoundingClientRect();
  const prevSelection = cursor.selection;

  if (nextSelection === null) {
    if (prevSelection === null) {
      return;
    } else {
      cursor.selection = null;
      destroySelection(binding, prevSelection);
      return;
    }
  } else {
    cursor.selection = nextSelection;
  }

  const caret = nextSelection.caret;
  const color = nextSelection.color;
  const selections = nextSelection.selections;
  const anchor = nextSelection.anchor;
  const focus = nextSelection.focus;
  const anchorKey = anchor.key;
  const focusKey = focus.key;
  const anchorNode = nodeMap.get(anchorKey);
  const focusNode = nodeMap.get(focusKey);

  if (anchorNode == null || focusNode == null) {
    return;
  }
  
  let selectionRects: Array<DOMRect>;

  // Handle collapsed selection on a linebreak
  if (anchorNode === focusNode && $isLineBreakNode(anchorNode)) {
    const brRect = (
      editor.getElementByKey(anchorKey) as HTMLElement
    ).getBoundingClientRect();
    selectionRects = [brRect];
  } else {
    const range = createDOMRange(
      editor,
      anchorNode,
      anchor.offset,
      focusNode,
      focus.offset,
    );

    if (range === null) {
      return;
    }
    selectionRects = createRectsFromDOMRange(editor, range);
  }

  const selectionsLength = selections.length;
  const selectionRectsLength = selectionRects.length;

  for (let i = 0; i < selectionRectsLength; i++) {
    const selectionRect = selectionRects[i];
    let selection = selections[i];

    if (selection === undefined) {
      selection = document.createElement('span');
      selections[i] = selection;
      const selectionBg = document.createElement('span');
      selection.appendChild(selectionBg);
      cursorsContainer.appendChild(selection);
    }

    const top = selectionRect.top - containerRect.top;
    const left = selectionRect.left - containerRect.left;
    const style = `position:absolute;top:${top}px;left:${left}px;height:${selectionRect.height}px;width:${selectionRect.width}px;pointer-events:none;z-index:5;`;
    selection.style.cssText = style;

    (
      selection.firstChild as HTMLSpanElement
    ).style.cssText = `${style}left:0;top:0;background-color:${color};opacity:0.3;`;

    if (i === selectionRectsLength - 1) {
      if (caret.parentNode !== selection) {
        selection.appendChild(caret);
      }
    }
  }

  for (let i = selectionsLength - 1; i >= selectionRectsLength; i--) {
    const selection = selections[i];
    cursorsContainer.removeChild(selection);
    selections.pop();
  }
}

export function syncLexicalSelectionToLoro(
  binding: Binding,
  provider: Provider,
  prevSelection: null | BaseSelection,
  nextSelection: null | BaseSelection,
): void {
  const awareness = provider.awareness;
  const localState = awareness.getLocalState();

  if (localState === null) {
    return;
  }

  const {
    anchorPos: currentAnchorPos,
    focusPos: currentFocusPos,
    name,
    color,
    focusing,
    awarenessData,
  } = localState;

  let anchorPos: LoroCursor | null = null;
  let focusPos: LoroCursor | null = null;

  // Check if we should clear the selection
  if (
    nextSelection === null ||
    (currentAnchorPos !== null && !nextSelection.is(prevSelection))
  ) {
    if (prevSelection === null) {
      return;
    }
  }

  // Convert Lexical selection to Loro cursors if we have a range selection
  if ($isRangeSelection(nextSelection)) {
    anchorPos = convertLexicalPointToCursor(nextSelection.anchor, binding);
    focusPos = convertLexicalPointToCursor(nextSelection.focus, binding);
  }

  // Check if cursor positions have actually changed
  const shouldUpdate = 
    shouldUpdatePosition(currentAnchorPos, anchorPos) ||
    shouldUpdatePosition(currentFocusPos, focusPos);

  if (shouldUpdate) {
    // Update the local state in EphemeralStore via awareness
    awareness.setLocalState({
      ...localState,
      anchorPos,
      awarenessData,
      color,
      focusPos,
      focusing,
      name,
    });
  }
}

// Helper function to determine if cursor position should be updated
function shouldUpdatePosition(
  currentPos: LoroCursor | null | undefined,
  pos: LoroCursor | null | undefined,
): boolean {
  if (currentPos == null) {
    return pos != null;
  } else if (pos == null) {
    return true;
  } else {
    // For now, do a simple comparison - in full implementation would compare Loro Cursor objects properly
    const current = currentPos as any;
    const next = pos as any;
    return current.nodeKey !== next.nodeKey || current.offset !== next.offset;
  }
}

/*****************************************************************************/

export function $syncLocalCursorPosition(
  binding: Binding,
  provider: Provider,
): void {
  const awareness = provider.awareness;
  const localState = awareness.getLocalState();

  if (localState === null) {
    return;
  }

  const { anchorPos, focusPos } = localState;

  // Convert Loro cursors back to Lexical selection
  if (anchorPos !== null && focusPos !== null) {
    const selectionInfo = convertLoroSelectionToLexical(anchorPos, focusPos);
    
    if (selectionInfo) {
      const { anchorKey, anchorOffset, focusKey, focusOffset } = selectionInfo;
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        return;
      }

      // Update the Lexical selection to match the cursor positions
      $setPoint(selection.anchor, anchorKey, anchorOffset);
      $setPoint(selection.focus, focusKey, focusOffset);
    }
  }
}

