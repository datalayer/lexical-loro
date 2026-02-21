/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

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
import type { Cursor as LoroCursor, LoroTreeNode } from 'loro-crdt';
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

// Helper function to find Loro tree node for a Lexical NodeKey (read-only lookup)
function findLoroTreeNodeForLexicalKey(nodeKey: NodeKey, binding: Binding): LoroTreeNode | null {
  try {
    const nodeMapper = binding.nodeMapper;
    const treeId = nodeMapper.getTreeIDByLexicalKey(nodeKey);
    if (!treeId) {
      return null;
    }
    const tree = binding.tree;
    if (tree.has(treeId)) {
      return tree.getNodeByID(treeId) || null;
    }
    return null;
  } catch (error) {
    console.warn('Failed to find Loro tree node for Lexical key:', nodeKey, error);
    return null;
  }
}

// Helper function to convert a Lexical Point to a Loro Cursor.
// The cursor data uses TreeIDs (stable across all clients) instead of NodeKeys
// (local to each editor instance) to ensure correct cross-client resolution.
function convertLexicalPointToCursor(point: Point, binding: Binding): LoroCursor | null {
  try {
    const node = $getNodeByKey(point.key);
    if (!node) {
      return null;
    }

    const nodeMapper = binding.nodeMapper;

    // --- Text node ---
    if ($isTextNode(node)) {
      const treeId = nodeMapper.getTreeIDByLexicalKey(point.key);
      if (!treeId) {
        return null;
      }
      const textContent = node.getTextContent();
      const offset = Math.min(point.offset, textContent.length);

      return {
        treeId,
        offset,
        pointType: 'text',
      } as any;
    }

    // --- Element node (paragraphs, headings, table cells, …) ---
    if ($isElementNode(node)) {
      const children = node.getChildren();

      if (children.length === 0) {
        // Empty element (e.g. freshly-created paragraph after Enter)
        const treeId = nodeMapper.getTreeIDByLexicalKey(point.key);
        if (!treeId) return null;
        return { treeId, offset: point.offset, pointType: 'element' } as any;
      }

      // Try to resolve the child at `point.offset`
      if (point.offset < children.length) {
        const child = children[point.offset];
        if (child) {
          const childTreeId = nodeMapper.getTreeIDByLexicalKey(child.getKey());
          if (childTreeId) {
            return {
              treeId: childTreeId,
              offset: 0,
              pointType: $isTextNode(child) ? 'text' : 'element',
            } as any;
          }
        }
      }

      // Fallback: cursor is at/past the end of this element's children
      const treeId = nodeMapper.getTreeIDByLexicalKey(point.key);
      if (!treeId) return null;
      return { treeId, offset: point.offset, pointType: 'element' } as any;
    }

    // --- Any other node type (decorator, linebreak, …) ---
    const treeId = nodeMapper.getTreeIDByLexicalKey(point.key);
    if (!treeId) return null;
    return { treeId, offset: point.offset, pointType: 'element' } as any;
  } catch (error) {
    console.warn('Failed to convert Lexical point to Loro cursor:', error);
    return null;
  }
}

// Helper function to convert Loro cursor data back to Lexical selection.
// Always resolves via TreeID → NodeMapper → local NodeKey.
// NodeKeys are never transmitted between clients because they are
// editor-instance-local and would map to wrong nodes on the remote side.
function convertLoroSelectionToLexical(
  anchorCursor: LoroCursor | null,
  focusCursor: LoroCursor | null,
  binding: Binding
): { anchorKey: NodeKey; anchorOffset: number; focusKey: NodeKey; focusOffset: number } | null {
  try {
    if (!anchorCursor || !focusCursor) {
      return null;
    }

    const anchor = anchorCursor as any;
    const focus = focusCursor as any;
    const nodeMapper = binding.nodeMapper;

    let anchorKey: NodeKey | null = null;
    let focusKey: NodeKey | null = null;

    if (anchor.treeId) {
      anchorKey = nodeMapper.getLexicalKeyByLoroId(anchor.treeId);
    }
    if (focus.treeId) {
      focusKey = nodeMapper.getLexicalKeyByLoroId(focus.treeId);
    }

    if (!anchorKey || !focusKey) {
      // Mapping not yet available — tree operations may not have arrived yet.
      // Cursors will be re-synced after the next tree integration.
      return null;
    }

    return {
      anchorKey,
      anchorOffset: anchor.offset || 0,
      focusKey,
      focusOffset: focus.offset || 0,
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
  isCurrentUser: boolean = false,
): CursorSelection {
  const color = cursor.color;
  
  // Helper function to convert color to rgba with opacity
  const getColorWithOpacity = (color: string, opacity: number): string => {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  };

  const caretColor = isCurrentUser ? getColorWithOpacity(color, 0.6) : color;
  const nameBackgroundColor = isCurrentUser ? getColorWithOpacity(color, 0.7) : color;

  const caret = document.createElement('span');
  caret.style.cssText = `position:absolute;top:0;bottom:0;right:-1px;width:2px;background-color:${caretColor};z-index:10;${isCurrentUser ? 'opacity:0.8;' : ''}`;
  const name = document.createElement('span');
  name.textContent = cursor.name;
  name.style.cssText = `position:absolute;left:-2px;top:-16px;background-color:${nameBackgroundColor};color:#fff;line-height:12px;font-size:12px;padding:2px;font-family:Arial;font-weight:bold;white-space:nowrap;${isCurrentUser ? 'opacity:0.9;' : ''}`;
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

  // Process all cursor positions from awareness (including local user)
  for (let i = 0; i < awarenessStates.length; i++) {
    const awarenessState = awarenessStates[i];
    const [clientID, awareness] = awarenessState;

    visitedClientIDs.add(clientID);
    const { name, color, focusing } = awareness;
    const isCurrentUser = clientID === localClientID;
    let selection = null;

    let cursor = cursors.get(clientID);

    if (cursor === undefined) {
      // Add "(Me)" label for current user's cursor
      const cursorName = isCurrentUser ? `${name} (Me)` : name;
      cursor = createCollabCursor(cursorName, color);
      cursors.set(clientID, cursor);
      console.log('Added new cursor:', { clientID, name: cursorName, color, isCurrentUser, totalCursors: cursors.size });
    }

    // Render cursor/selection whenever valid anchorPos/focusPos exist.
    // We intentionally do NOT gate on `focusing` because the FOCUS_COMMAND
    // and selection-update can race — the selection update may broadcast
    // before FOCUS_COMMAND fires, leaving `focusing: false` even though
    // the user clearly has the editor focused (they are selecting text).
    const { anchorPos, focusPos } = awareness;

    if (anchorPos !== null && focusPos !== null) {
      const selectionInfo = convertLoroSelectionToLexical(anchorPos, focusPos, binding);
      
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
            isCurrentUser,
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

        if (!isCurrentUser) {
          const isExpanded = anchorKey !== focusKey || anchorOffset !== focusOffset;
          console.log('[CURSOR-DEBUG] Remote selection resolved:', {
            clientID, anchorKey, anchorOffset, focusKey, focusOffset, isExpanded, color, focusing
          });
        }
      } else if (!isCurrentUser) {
        console.warn('[CURSOR-DEBUG] convertLoroSelectionToLexical returned null for remote:', {
          clientID, anchorPos, focusPos
        });
      }
    }

    updateCursor(binding, cursor, selection, nodeMap, isCurrentUser);
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
  isCurrentUser: boolean = false,
): void {
  const editor = binding.editor;
  const rootElement = editor.getRootElement();
  const cursorsContainer = binding.cursorsContainer;

  if (cursorsContainer === null || rootElement === null) {
    if (!isCurrentUser && nextSelection !== null) {
      console.warn('[CURSOR-DEBUG] updateCursor EXIT: container/root null:', {
        cursorsContainer: !!cursorsContainer, rootElement: !!rootElement
      });
    }
    return;
  }

  // The cursorsContainer is a position:fixed overlay covering the viewport.
  // Use its own getBoundingClientRect() as the coordinate reference,
  // so that absolute children are positioned correctly relative to it.
  const containerRect = cursorsContainer.getBoundingClientRect();
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
    if (!isCurrentUser) {
      console.warn('[CURSOR-DEBUG] updateCursor: anchorNode or focusNode not found in nodeMap:', {
        anchorKey, focusKey, anchorFound: anchorNode != null, focusFound: focusNode != null
      });
    }
    return;
  }

  // Determine if the selection is collapsed (cursor only) or expanded (text selected)
  const isCollapsed = anchorKey === focusKey && anchor.offset === focus.offset;

  let selectionRects: Array<DOMRect>;

  // Handle collapsed selection on a linebreak
  if (anchorNode === focusNode && $isLineBreakNode(anchorNode)) {
    const brElement = editor.getElementByKey(anchorKey) as HTMLElement;
    if (brElement) {
      const brRect = brElement.getBoundingClientRect();
      selectionRects = [brRect];
    } else {
      selectionRects = [];
    }
  } else {
    const range = createDOMRange(
      editor,
      anchorNode,
      anchor.offset,
      focusNode,
      focus.offset,
    );

    if (range === null) {
      if (!isCurrentUser) {
        console.warn('[CURSOR-DEBUG] updateCursor: createDOMRange returned null for remote selection');
      }
      return;
    }

    if (isCollapsed) {
      // For collapsed cursors, get all rects (including zero-width) to position the caret.
      // createRectsFromDOMRange filters out rects with width < 1, so use the raw
      // range rect as a fallback for caret positioning.
      selectionRects = createRectsFromDOMRange(editor, range);
      if (selectionRects.length === 0) {
        // Fallback: use the bounding rect of the collapsed range
        const boundingRect = range.getBoundingClientRect();
        if (boundingRect.height > 0) {
          selectionRects = [boundingRect];
        }
      }
    } else {
      selectionRects = createRectsFromDOMRange(editor, range);
    }
  }

  if (!isCurrentUser) {
    console.log('[CURSOR-DEBUG] updateCursor rendering remote cursor:', {
      isCollapsed, rectsCount: selectionRects.length,
      rects: selectionRects.map(r => ({ w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), l: Math.round(r.left) })),
      color, containerTag: cursorsContainer?.tagName,
      containerRect: { t: Math.round(containerRect.top), l: Math.round(containerRect.left) },
    });
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
    // For collapsed cursors, give the wrapper a minimum width so the caret
    // (positioned inside) is not clipped by some browsers.
    const effectiveWidth = isCollapsed ? Math.max(selectionRect.width, 4) : selectionRect.width;
    const style = `position:absolute;top:${top}px;left:${left}px;height:${selectionRect.height}px;width:${effectiveWidth}px;pointer-events:none;z-index:10;overflow:visible;`;
    selection.style.cssText = style;

    if (isCollapsed) {
      // Collapsed cursor: hide the background span.
      (selection.firstChild as HTMLSpanElement).style.cssText =
        `position:absolute;left:0;top:0;width:0;height:0;`;
      // Make the caret clearly visible with explicit height and a bright border-left for contrast.
      caret.style.cssText = `position:absolute;top:0;left:0;width:2px;height:${selectionRect.height}px;background-color:${color};z-index:10;`;
    } else if (isCurrentUser) {
      // Current user's expanded selection: very subtle since the browser already
      // shows the native selection highlight.
      (selection.firstChild as HTMLSpanElement).style.cssText =
        `position:absolute;left:0;top:0;width:${selectionRect.width}px;height:${selectionRect.height}px;` +
        `background-color:${color};opacity:0.08;border-radius:2px;pointer-events:none;`;
    } else {
      // Remote user's expanded selection: clearly visible with transparency.
      // The user's color is shown as a translucent overlay so the text beneath
      // remains readable.
      (selection.firstChild as HTMLSpanElement).style.cssText =
        `position:absolute;left:0;top:0;width:${selectionRect.width}px;height:${selectionRect.height}px;` +
        `background-color:${color};opacity:0.25;border-radius:2px;pointer-events:none;`;
    }

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
  // Trace every entry into this function
  const isRange = $isRangeSelection(nextSelection);
  const selInfo = isRange ? {
    anchorKey: (nextSelection as RangeSelection).anchor.key,
    anchorOffset: (nextSelection as RangeSelection).anchor.offset,
    focusKey: (nextSelection as RangeSelection).focus.key,
    focusOffset: (nextSelection as RangeSelection).focus.offset,
  } : null;
  console.log('[CURSOR-TRACE] syncLexicalSelectionToLoro ENTERED:', {
    isRange,
    isNull: nextSelection === null,
    type: nextSelection ? nextSelection.constructor.name : 'null',
    sel: selInfo,
  });

  const awareness = provider.awareness;
  const localState = awareness.getLocalState();

  if (localState === null) {
    console.log('[CURSOR-TRACE] EXIT: localState is null');
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

  // Convert Lexical selection to Loro cursors if we have a range selection
  if ($isRangeSelection(nextSelection)) {
    anchorPos = convertLexicalPointToCursor(nextSelection.anchor, binding);
    focusPos = convertLexicalPointToCursor(nextSelection.focus, binding);

    // Debug: trace ALL selection conversions
    const lexAnchor = nextSelection.anchor;
    const lexFocus = nextSelection.focus;
    const isLexExpanded = lexAnchor.key !== lexFocus.key || lexAnchor.offset !== lexFocus.offset;
    if (isLexExpanded) {
      console.log('[CURSOR-DEBUG] Converting EXPANDED selection:', {
        lexAnchor: { key: lexAnchor.key, offset: lexAnchor.offset, type: lexAnchor.type },
        lexFocus: { key: lexFocus.key, offset: lexFocus.offset, type: lexFocus.type },
        loroAnchor: anchorPos ? { treeId: (anchorPos as any).treeId, offset: (anchorPos as any).offset, pointType: (anchorPos as any).pointType } : null,
        loroFocus: focusPos ? { treeId: (focusPos as any).treeId, offset: (focusPos as any).offset, pointType: (focusPos as any).pointType } : null,
      });
    }
  } else if (nextSelection === null) {
    // Selection cleared — broadcast null positions
    console.log('[CURSOR-TRACE] Selection is null, will broadcast null positions');
  } else {
    // Not a range selection (e.g. NodeSelection) — skip
    console.log('[CURSOR-TRACE] EXIT: Not a RangeSelection, type=' + nextSelection.constructor.name);
    return;
  }

  // Always broadcast to keep remote cursors in sync.
  // The shouldUpdatePosition check prevents redundant updates for unchanged positions.
  const shouldUpdate =
    shouldUpdatePosition(currentAnchorPos, anchorPos) ||
    shouldUpdatePosition(currentFocusPos, focusPos);

  if (!shouldUpdate) {
    console.log('[CURSOR-TRACE] EXIT: shouldUpdate=false, positions unchanged');
    return;
  }

  const isExpanded = anchorPos && focusPos &&
    ((anchorPos as any).treeId !== (focusPos as any).treeId ||
     (anchorPos as any).offset !== (focusPos as any).offset);
  console.log('[CURSOR-DEBUG] Broadcasting selection:', {
    hasAnchor: !!anchorPos, hasFocus: !!focusPos, isExpanded, focusing,
    anchor: anchorPos ? { treeId: (anchorPos as any).treeId, offset: (anchorPos as any).offset } : null,
    focus: focusPos ? { treeId: (focusPos as any).treeId, offset: (focusPos as any).offset } : null,
    currentAnchor: currentAnchorPos ? { offset: (currentAnchorPos as any).offset } : null,
    currentFocus: currentFocusPos ? { offset: (currentFocusPos as any).offset } : null,
  });

  // When we have a valid selection to broadcast, the editor IS focused —
  // force `focusing: true` to prevent the FOCUS_COMMAND race condition
  // where the selection update fires before FOCUS_COMMAND sets the flag.
  const effectiveFocusing = (anchorPos !== null && focusPos !== null) ? true : focusing;

  // Update the local state in EphemeralStore via awareness
  awareness.setLocalState({
    ...localState,
    anchorPos,
    awarenessData,
    color,
    focusPos,
    focusing: effectiveFocusing,
    name,
  });
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
    // Compare using treeId (stable across clients) and offset
    const current = currentPos as any;
    const next = pos as any;
    return current.treeId !== next.treeId || current.offset !== next.offset || current.pointType !== next.pointType;
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
    const selectionInfo = convertLoroSelectionToLexical(anchorPos, focusPos, binding);
    
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

