/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroBinding, ClientID, LoroCollabCursor } from '../LoroBinding';
import type { Cursor } from 'loro-crdt';

/**
 * Loro cursor management (equivalent to YJS RelativePosition)
 * This handles cursor synchronization between peers using Loro Cursor API
 */

export interface CursorState {
  anchor: Cursor;
  focus: Cursor;
}

export interface PeerCursorInfo {
  clientId: ClientID;
  name: string;
  color: string;
  selection: CursorState | null;
}

/**
 * Update cursor position for the current user
 */
export function updateLocalCursor(
  binding: LoroBinding,
  selection: CursorState | null
): void {
  const { ephemeral, clientID } = binding;
  
  try {
    // Store cursor in ephemeral store (equivalent to YJS awareness)
    if (ephemeral && selection) {
      ephemeral[clientID] = {
        selection,
        name: `User ${clientID.slice(0, 8)}`,
        color: generateUserColor(clientID),
      };
      
      console.log('🎯 Updated local cursor:', selection);
    }
  } catch (error) {
    console.error('❌ Failed to update local cursor:', error);
  }
}

/**
 * Get all peer cursors from ephemeral store
 */
export function getPeerCursors(binding: LoroBinding): Map<ClientID, PeerCursorInfo> {
  const { ephemeral, clientID } = binding;
  const cursors = new Map<ClientID, PeerCursorInfo>();
  
  try {
    if (ephemeral) {
      for (const [peerId, peerState] of Object.entries(ephemeral)) {
        if (peerId !== clientID && peerState) {
          cursors.set(peerId, peerState as PeerCursorInfo);
        }
      }
    }
  } catch (error) {
    console.error('❌ Failed to get peer cursors:', error);
  }
  
  return cursors;
}

/**
 * Convert Lexical selection to Loro cursor positions
 */
export function lexicalSelectionToLoroCursor(
  binding: LoroBinding,
  lexicalSelection: any
): CursorState | null {
  const { rootTree } = binding;
  
  try {
    if (!lexicalSelection) {
      return null;
    }
    
    // TODO: Implement proper conversion from Lexical selection to Loro cursors
    // This should use the Loro Tree API to create cursor positions
    console.log('🔄 Converting Lexical selection to Loro cursor:', lexicalSelection);
    
    // Placeholder cursor creation
    // const anchor = rootTree.getCursor(0);
    // const focus = rootTree.getCursor(0);
    
    return null; // Return null for now until proper implementation
    
  } catch (error) {
    console.error('❌ Failed to convert Lexical selection to Loro cursor:', error);
    return null;
  }
}

/**
 * Convert Loro cursor positions to Lexical selection
 */
export function loroCursorToLexicalSelection(
  binding: LoroBinding,
  cursorState: CursorState
): any {
  try {
    // TODO: Implement proper conversion from Loro cursors to Lexical selection
    // This should traverse the tree and find the corresponding Lexical positions
    console.log('🔄 Converting Loro cursor to Lexical selection:', cursorState);
    
    return null; // Return null for now until proper implementation
    
  } catch (error) {
    console.error('❌ Failed to convert Loro cursor to Lexical selection:', error);
    return null;
  }
}

/**
 * Generate a consistent color for a user based on their client ID
 */
function generateUserColor(clientId: ClientID): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
  ];
  
  // Simple hash to consistently assign colors
  let hash = 0;
  for (let i = 0; i < clientId.length; i++) {
    hash = clientId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Initialize cursor synchronization
 */
export function initializeCursorSync(binding: LoroBinding): () => void {
  // TODO: Set up cursor sync with ephemeral store
  // This should listen for selection changes and broadcast cursor updates
  
  console.log('🎯 Initializing cursor sync');
  
  // Return cleanup function
  return () => {
    console.log('🧹 Cleaning up cursor sync');
  };
}
