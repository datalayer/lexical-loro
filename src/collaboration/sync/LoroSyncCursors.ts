/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { BaseSelection, NodeKey, Point } from 'lexical';
import type { LoroBinding, LoroProvider, LoroUserState, ClientID } from '../LoroBinding';
import type { Cursor } from 'loro-crdt';

import {
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
} from 'lexical';

export type LoroCursorSelection = {
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

export type LoroCursor = {
  color: string;
  name: string;
  selection: null | LoroCursorSelection;
};

export type SyncLoroCursorPositionsFn = (
  binding: LoroBinding,
  provider: LoroProvider,
) => void;

/**
 * Create Loro cursor from Lexical point (equivalent to YJS createRelativePosition)
 * 
 * This function converts a Lexical editor position into a Loro Cursor,
 * which is equivalent to YJS RelativePosition but uses Loro's CRDT semantics.
 * 
 * Key Architecture Mapping:
 * - YJS RelativePosition → Loro Cursor
 * - YJS XmlText offsets → Loro Text positions  
 * - YJS element positions → Loro Tree node positions
 */
function createLoroCursor(
  point: Point,
  binding: LoroBinding,
): Cursor | null {
  console.log('🎯 Creating Loro cursor from point:', point);
  
  try {
    const { rootText, collabNodeMap } = binding;
    const collabNode = collabNodeMap.get(point.key);

    if (collabNode === undefined) {
      console.warn('⚠️ No collab node found for key:', point.key);
      return null;
    }

    const offset = point.offset;

    // For text nodes, create cursor in the root text container
    if (point.type === 'text') {
      // TODO: Calculate actual text offset in the Loro Text container
      // This requires mapping from Lexical text node positions to Loro text positions
      console.log('📝 Creating text cursor at offset:', offset);
      return rootText.getCursor(offset) || null;
    }

    // For element nodes, create cursor based on child position
    if (point.type === 'element') {
      const parent = point.getNode();
      if (!$isElementNode(parent)) {
        console.warn('⚠️ Element point must be an element node');
        return null;
      }

      // Calculate accumulated offset for element position
      let accumulatedOffset = 0;
      let i = 0;
      let node = parent.getFirstChild();
      
      while (node !== null && i++ < offset) {
        if ($isTextNode(node)) {
          accumulatedOffset += node.getTextContentSize();
        } else {
          accumulatedOffset += 1; // Non-text nodes count as 1
        }
        node = node.getNextSibling();
      }

      console.log('🔲 Creating element cursor at accumulated offset:', accumulatedOffset);
      return rootText.getCursor(accumulatedOffset) || null;
    }

    console.warn('⚠️ Unknown point type:', point.type);
    return null;

  } catch (error) {
    console.error('❌ Error creating Loro cursor:', error);
    return null;
  }
}

/**
 * Create Lexical point from Loro cursor (equivalent to YJS absolute position conversion)
 * 
 * This function converts a Loro Cursor back into a Lexical editor position,
 * enabling proper cursor positioning for remote collaborators.
 */
function createPointFromLoroCursor(
  cursor: Cursor,
  binding: LoroBinding,
): Point | null {
  console.log('🎯 Creating point from Loro cursor');
  
  try {
    const { doc } = binding;
    
    // Get current position from cursor
    const position = doc.getCursorPos(cursor);
    if (!position) {
      console.warn('⚠️ Could not get position from cursor');
      return null;
    }

    // TODO: Convert Loro text position back to Lexical node position
    // This requires mapping from Loro text offsets to Lexical node keys and offsets
    console.log('📍 Converting position:', position);
    
    // Placeholder implementation - return root position
    return {
      key: 'root',
      offset: position.offset,
      type: 'element',
    } as Point;

  } catch (error) {
    console.error('❌ Error creating point from cursor:', error);
    return null;
  }
}

/**
 * Sync local cursor position to awareness (equivalent to YJS $syncLocalCursorPosition)
 */
export function $syncLocalCursorPosition(
  binding: LoroBinding,
  provider: LoroProvider,
): void {
  console.log('🎯 Syncing local cursor position');
  
  try {
    const { awareness } = provider;
    if (!awareness) {
      console.warn('⚠️ No awareness available for cursor sync');
      return;
    }

    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      console.log('⏭️ No range selection, clearing cursor position');
      
      // Clear cursor position in awareness
      const localState = awareness.getLocalState();
      if (localState) {
        localState.anchorCursor = null;
        localState.focusCursor = null;
        awareness.setLocalState(localState);
      }
      return;
    }

    // Create cursors for anchor and focus points
    const anchorCursor = createLoroCursor(selection.anchor, binding);
    const focusCursor = createLoroCursor(selection.focus, binding);

    console.log('📍 Created cursors:', { anchorCursor, focusCursor });

    // Update awareness with new cursor positions
    const localState = awareness.getLocalState();
    if (localState) {
      localState.anchorCursor = anchorCursor;
      localState.focusCursor = focusCursor;
      awareness.setLocalState(localState);
    }

  } catch (error) {
    console.error('❌ Error syncing local cursor position:', error);
  }
}

/**
 * Sync Lexical selection to Loro awareness (equivalent to YJS syncLexicalSelectionToYjs)
 */
export function syncLexicalSelectionToLoro(
  binding: LoroBinding,
  provider: LoroProvider,
  prevSelection: BaseSelection | null,
  currentSelection: BaseSelection | null,
): void {
  console.log('🎯 Syncing Lexical selection to Loro awareness');
  
  try {
    const { awareness } = provider;
    if (!awareness) {
      return;
    }

    // Only sync if selection actually changed
    if (prevSelection === currentSelection) {
      return;
    }

    if (!$isRangeSelection(currentSelection)) {
      // Clear selection in awareness
      const localState = awareness.getLocalState();
      if (localState) {
        localState.anchorCursor = null;
        localState.focusCursor = null;
        awareness.setLocalState(localState);
      }
      return;
    }

    // Create cursors for new selection
    const anchorCursor = createLoroCursor(currentSelection.anchor, binding);
    const focusCursor = createLoroCursor(currentSelection.focus, binding);

    // Update awareness
    const localState = awareness.getLocalState();
    if (localState) {
      localState.anchorCursor = anchorCursor;
      localState.focusCursor = focusCursor;
      awareness.setLocalState(localState);
    }

    console.log('✅ Updated selection in awareness');

  } catch (error) {
    console.error('❌ Error syncing selection to Loro:', error);
  }
}

/**
 * Main cursor synchronization function (equivalent to YJS syncCursorPositions)
 * 
 * This function handles bidirectional cursor synchronization:
 * 1. Updates local cursor position in awareness
 * 2. Renders remote users' cursors in the editor
 */
export function syncLoroCursorPositions(
  binding: LoroBinding,
  provider: LoroProvider,
): void {
  console.log('🎯 Syncing cursor positions');
  
  try {
    // Sync local cursor position
    $syncLocalCursorPosition(binding, provider);

    // Render remote cursors
    renderRemoteCursors(binding, provider);

  } catch (error) {
    console.error('❌ Error in cursor synchronization:', error);
  }
}

/**
 * Render remote users' cursors in the editor
 */
function renderRemoteCursors(
  binding: LoroBinding,
  provider: LoroProvider,
): void {
  console.log('👥 Rendering remote cursors');
  
  try {
    const { awareness } = provider;
    const { cursorsContainer, clientID } = binding;
    
    if (!awareness || !cursorsContainer) {
      return;
    }

    const states = awareness.getStates();
    
    // Clear existing cursors
    cursorsContainer.innerHTML = '';

    // Render cursor for each remote user
    states.forEach((userState: LoroUserState, remoteClientID: ClientID) => {
      if (remoteClientID === clientID) {
        return; // Skip local user
      }

      if (!userState.anchorCursor || !userState.focusCursor) {
        return; // No cursor position
      }

      console.log('👤 Rendering cursor for user:', userState.name);

      // Convert Loro cursors back to DOM positions
      const anchorPoint = createPointFromLoroCursor(userState.anchorCursor, binding);
      const focusPoint = createPointFromLoroCursor(userState.focusCursor, binding);

      if (anchorPoint && focusPoint) {
        renderUserCursor(
          cursorsContainer,
          userState.name,
          userState.color,
          anchorPoint,
          focusPoint
        );
      }
    });

  } catch (error) {
    console.error('❌ Error rendering remote cursors:', error);
  }
}

/**
 * Render individual user cursor in the DOM
 */
function renderUserCursor(
  container: HTMLElement,
  name: string,
  color: string,
  _anchorPoint: Point, // eslint-disable-line @typescript-eslint/no-unused-vars
  _focusPoint: Point, // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  console.log('🎨 Rendering cursor for:', name);
  
  try {
    // Create cursor element
    const cursorElement = document.createElement('div');
    cursorElement.className = 'loro-cursor';
    cursorElement.style.position = 'absolute';
    cursorElement.style.backgroundColor = color;
    cursorElement.style.width = '2px';
    cursorElement.style.height = '20px';
    cursorElement.style.pointerEvents = 'none';
    cursorElement.style.zIndex = '1000';

    // Create name label
    const nameElement = document.createElement('div');
    nameElement.className = 'loro-cursor-name';
    nameElement.textContent = name;
    nameElement.style.position = 'absolute';
    nameElement.style.top = '-25px';
    nameElement.style.backgroundColor = color;
    nameElement.style.color = 'white';
    nameElement.style.padding = '2px 6px';
    nameElement.style.borderRadius = '3px';
    nameElement.style.fontSize = '12px';
    nameElement.style.whiteSpace = 'nowrap';

    cursorElement.appendChild(nameElement);

    // TODO: Calculate actual DOM position from Lexical points
    // For now, position at top-left as placeholder
    cursorElement.style.left = '0px';
    cursorElement.style.top = '0px';

    container.appendChild(cursorElement);

  } catch (error) {
    console.error('❌ Error rendering user cursor:', error);
  }
}

/**
 * Get anchor and focus nodes for user state (equivalent to YJS getAnchorAndFocusCollabNodesForUserState)
 */
export function getAnchorAndFocusLoroNodesForUserState(
  userState: LoroUserState,
  binding: LoroBinding,
): {
  anchorNode: any | null;
  focusNode: any | null;
} {
  console.log('🎯 Getting anchor and focus nodes for user state');
  
  try {
    const { anchorCursor, focusCursor } = userState;
    
    if (!anchorCursor || !focusCursor) {
      return { anchorNode: null, focusNode: null };
    }

    // Convert cursors to Lexical points
    const anchorPoint = createPointFromLoroCursor(anchorCursor, binding);
    const focusPoint = createPointFromLoroCursor(focusCursor, binding);

    // Get corresponding Lexical nodes
    const anchorNode = anchorPoint ? $getNodeByKey(anchorPoint.key) : null;
    const focusNode = focusPoint ? $getNodeByKey(focusPoint.key) : null;

    return { anchorNode, focusNode };

  } catch (error) {
    console.error('❌ Error getting anchor and focus nodes:', error);
    return { anchorNode: null, focusNode: null };
  }
}
