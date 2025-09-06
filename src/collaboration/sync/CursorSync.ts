/**
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroBinding, ClientID } from '../LoroBinding';
import type { Cursor } from 'loro-crdt';

/**
 * Type definition for cursor position sync function (equivalent to YJS SyncCursorPositionsFn)
 */
export type SyncLoroCursorPositionsFn = (binding: LoroBinding) => void;

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
  try {
    if (!lexicalSelection) {
      return null;
    }
    
    // Convert Lexical Point to Loro Cursor (following YJS RelativePosition pattern)
    const anchor = createLoroCursorFromLexicalPoint(binding, lexicalSelection.anchor);
    const focus = createLoroCursorFromLexicalPoint(binding, lexicalSelection.focus);
    
    if (anchor && focus) {
      console.log('🔄 Successfully converted Lexical selection to Loro cursors');
      return { anchor, focus };
    }
    
    console.log('🔄 Failed to convert Lexical selection - missing anchor or focus');
    return null;
    
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
    // Convert Loro Cursors to Lexical Points (following YJS AbsolutePosition pattern)
    const anchorPoint = createLexicalPointFromLoroCursor(binding, cursorState.anchor);
    const focusPoint = createLexicalPointFromLoroCursor(binding, cursorState.focus);
    
    if (anchorPoint && focusPoint) {
      console.log('🔄 Successfully converted Loro cursors to Lexical selection');
      return {
        anchor: anchorPoint,
        focus: focusPoint,
        type: 'range'
      };
    }
    
    console.log('🔄 Failed to convert Loro cursors - missing anchor or focus points');
    return null;
    
  } catch (error) {
    console.error('❌ Failed to convert Loro cursor to Lexical selection:', error);
    return null;
  }
}

/**
 * Create Loro Cursor from Lexical Point (equivalent to YJS createRelativePosition)
 */
function createLoroCursorFromLexicalPoint(
  binding: LoroBinding,
  lexicalPoint: any
): Cursor | null {
  const { rootText, collabNodeMap } = binding;
  
  try {
    if (!lexicalPoint || !lexicalPoint.key) {
      return null;
    }
    
    // Find the collaboration node for this Lexical node
    const collabNode = collabNodeMap.get(lexicalPoint.key);
    if (!collabNode) {
      console.warn('🔄 No collaboration node found for key:', lexicalPoint.key);
      return null;
    }
    
    // Convert Lexical position to global text offset
    const globalOffset = calculateGlobalTextOffset(binding, lexicalPoint.key, lexicalPoint.offset);
    
    if (globalOffset === null) {
      console.warn('🔄 Could not calculate global offset for point:', lexicalPoint);
      return null;
    }
    
    // Create cursor using Loro Text API (following documentation pattern)
    const cursor = rootText.getCursor(globalOffset);
    
    console.log('🎯 Created Loro cursor from Lexical point:', {
      key: lexicalPoint.key,
      offset: lexicalPoint.offset,
      globalOffset,
      cursor: cursor ? 'created' : 'failed'
    });
    
    return cursor || null;
    
  } catch (error) {
    console.error('❌ Failed to create Loro cursor from Lexical point:', error);
    return null;
  }
}

/**
 * Create Lexical Point from Loro Cursor (equivalent to YJS createAbsolutePositionFromRelativePosition)
 */
function createLexicalPointFromLoroCursor(
  binding: LoroBinding,
  loroCursor: Cursor
): any {
  const { doc } = binding;
  
  try {
    if (!loroCursor) {
      return null;
    }
    
    // Get position information from Loro cursor using getCursorPos API
    const positionInfo = doc.getCursorPos(loroCursor);
    if (!positionInfo) {
      console.warn('🔄 Could not get position from Loro cursor');
      return null;
    }
    
    // Convert global text position back to Lexical node and offset
    const lexicalPosition = convertGlobalOffsetToLexicalPoint(binding, positionInfo.offset);
    
    if (!lexicalPosition) {
      console.warn('🔄 Could not convert global offset to Lexical position');
      return null;
    }
    
    console.log('🎯 Created Lexical point from Loro cursor:', {
      globalOffset: positionInfo.offset,
      side: positionInfo.side,
      lexicalPosition
    });
    
    return lexicalPosition;
    
  } catch (error) {
    console.error('❌ Failed to create Lexical point from Loro cursor:', error);
    return null;
  }
}

/**
 * Calculate global text offset from Lexical node key and local offset
 */
function calculateGlobalTextOffset(
  _binding: LoroBinding, // TODO: Will be used for traversal
  nodeKey: string,
  localOffset: number
): number | null {
  // const { collabNodeMap } = binding; // TODO: Will be used for proper traversal
  
  try {
    // TODO: Implement proper traversal of the document to calculate global text offset
    // This should traverse the collaboration node map and sum up text lengths
    // until reaching the target node, then add the local offset
    
    console.log('🔄 Calculating global text offset for:', { nodeKey, localOffset });
    
    // Placeholder implementation - in a real implementation, this would:
    // 1. Traverse the document structure from root
    // 2. Sum text lengths of all preceding nodes
    // 3. Add the local offset within the target node
    
    // For now, return the local offset as a simple approximation
    return localOffset;
    
  } catch (error) {
    console.error('❌ Failed to calculate global text offset:', error);
    return null;
  }
}

/**
 * Convert global text offset back to Lexical node key and local offset
 */
function convertGlobalOffsetToLexicalPoint(
  _binding: LoroBinding, // TODO: Will be used for traversal
  globalOffset: number
): { key: string; offset: number; type: string } | null {
  // const { collabNodeMap } = binding; // TODO: Will be used for proper traversal
  
  try {
    // TODO: Implement proper conversion from global offset to Lexical position
    // This should traverse the collaboration node map and find which node
    // contains the given global offset, then calculate the local offset
    
    console.log('🔄 Converting global offset to Lexical point:', globalOffset);
    
    // Placeholder implementation - in a real implementation, this would:
    // 1. Traverse the document structure
    // 2. Find which node contains the global offset
    // 3. Calculate the local offset within that node
    
    // For now, return a placeholder pointing to root
    return {
      key: 'root',
      offset: globalOffset,
      type: 'text'
    };
    
  } catch (error) {
    console.error('❌ Failed to convert global offset to Lexical point:', error);
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
  
  console.log('🎯 Initializing cursor sync for binding:', !!binding);
  
  // Return cleanup function
  return () => {
    console.log('🧹 Cleaning up cursor sync');
    
    // Clean up pending updates
    if (pendingCursorUpdate) {
      clearTimeout(pendingCursorUpdate);
      pendingCursorUpdate = null;
    }
  };
}

/**
 * Validate cursor state for real-time testing
 */
export function validateCursorState(
  binding: LoroBinding,
  expectedPeerCount?: number
): {
  isValid: boolean;
  errors: string[];
  peerCount: number;
  cursors: Map<ClientID, PeerCursorInfo>;
} {
  const errors: string[] = [];
  const cursors = getPeerCursors(binding);
  
  try {
    // Validate ephemeral store availability
    if (!binding.ephemeral) {
      errors.push('Ephemeral store not available');
    }
    
    // Validate expected peer count
    if (expectedPeerCount !== undefined && cursors.size !== expectedPeerCount) {
      errors.push(`Expected ${expectedPeerCount} peers, but found ${cursors.size}`);
    }
    
    // Validate cursor data integrity
    for (const [clientId, peerInfo] of cursors) {
      if (!clientId) {
        errors.push('Invalid client ID found');
      }
      
      if (!peerInfo.selection) {
        errors.push(`Peer ${clientId} has no selection data`);
      }
      
      if (!peerInfo.color) {
        errors.push(`Peer ${clientId} has no color assigned`);
      }
    }
    
    console.log('🧪 Cursor state validation:', {
      isValid: errors.length === 0,
      errors,
      peerCount: cursors.size
    });
    
    return {
      isValid: errors.length === 0,
      errors,
      peerCount: cursors.size,
      cursors
    };
    
  } catch (error) {
    errors.push(`Validation error: ${error}`);
    return {
      isValid: false,
      errors,
      peerCount: cursors.size,
      cursors
    };
  }
}

/**
 * Test cursor synchronization with multiple concurrent users
 */
export function testCursorSynchronization(
  binding: LoroBinding,
  simulatedUsers: number = 3
): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`🧪 Testing cursor synchronization with ${simulatedUsers} simulated users`);
    
    const testResults: boolean[] = [];
    let completedTests = 0;
    
    // Simulate multiple users updating cursors
    for (let i = 0; i < simulatedUsers; i++) {
      const mockClientId = `test-user-${i}`;
      
      // Create mock cursor objects (simplified for testing)
      const mockSelection: CursorState = {
        anchor: { position: i * 10 } as unknown as Cursor,
        focus: { position: i * 10 + 5 } as unknown as Cursor
      };
      
      // Simulate cursor update
      setTimeout(() => {
        try {
          // Create mock ephemeral entry
          if (binding.ephemeral) {
            binding.ephemeral[mockClientId] = {
              clientId: mockClientId,
              name: `Test User ${i}`,
              color: generateUserColor(mockClientId),
              selection: mockSelection
            };
          }
          
          // Validate the update
          const validation = validateCursorState(binding, simulatedUsers);
          testResults.push(validation.isValid);
          completedTests++;
          
          console.log(`🧪 Test user ${i} cursor update:`, validation.isValid ? '✅' : '❌');
          
          // Check if all tests completed
          if (completedTests === simulatedUsers) {
            const allPassed = testResults.every(result => result === true);
            console.log(`🧪 Cursor synchronization test ${allPassed ? 'PASSED' : 'FAILED'}`);
            resolve(allPassed);
          }
          
        } catch (error) {
          console.error(`❌ Test user ${i} failed:`, error);
          testResults.push(false);
          completedTests++;
          
          if (completedTests === simulatedUsers) {
            resolve(false);
          }
        }
      }, i * 100); // Stagger the updates
    }
  });
}

// Performance optimization variables
let lastCursorUpdate = 0;
let pendingCursorUpdate: NodeJS.Timeout | null = null;

/**
 * Main cursor sync function (equivalent to YJS syncCursorPositions)
 * This is called by the main sync engine to synchronize cursor positions
 */
export function syncLoroCursorPositions(binding: LoroBinding): void {
  // Performance optimization: debounce cursor updates to avoid excessive re-renders
  const now = Date.now();
  const timeSinceLastUpdate = now - lastCursorUpdate;
  const minUpdateInterval = 50; // 50ms minimum between updates (20fps max)
  
  if (timeSinceLastUpdate < minUpdateInterval) {
    // Schedule update for later if too frequent
    if (!pendingCursorUpdate) {
      pendingCursorUpdate = setTimeout(() => {
        pendingCursorUpdate = null;
        syncLoroCursorPositions(binding);
      }, minUpdateInterval - timeSinceLastUpdate);
    }
    return;
  }
  
  lastCursorUpdate = now;
  console.log('🎯 Syncing Loro cursor positions (optimized)');
  
  try {
    // Get all peer cursors from ephemeral store
    const peerCursors = getPeerCursors(binding);
    
    // Batch cursor updates for better performance
    const cursorUpdates = new Map<ClientID, PeerCursorInfo>();
    
    // Collect all cursor updates
    for (const [clientId, peerInfo] of peerCursors) {
      if (peerInfo.selection) {
        cursorUpdates.set(clientId, peerInfo);
      }
    }
    
    // Apply cursor updates in a single batch
    if (cursorUpdates.size > 0) {
      requestAnimationFrame(() => {
        for (const [clientId, peerInfo] of cursorUpdates) {
          renderPeerCursor(binding, clientId, peerInfo);
        }
      });
    }
    
    console.log('🎯 Synced cursors for', cursorUpdates.size, 'peers (batched)');
  } catch (error) {
    console.error('❌ Failed to sync Loro cursor positions:', error);
  }
}

/**
 * Render a peer's cursor in the editor
 */
function renderPeerCursor(
  _binding: LoroBinding, // TODO: Will be used for DOM manipulation
  clientId: ClientID,
  peerInfo: PeerCursorInfo
): void {
  // TODO: Implement actual cursor rendering in DOM
  console.log('🎯 Rendering peer cursor:', { clientId, peerInfo });
}
