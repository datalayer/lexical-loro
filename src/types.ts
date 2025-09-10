/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { NodeKey } from 'lexical';
import type { PeerID } from 'loro-crdt';

// ============================================================================
// STABLE POSITIONING TYPES
// ============================================================================

/**
 * Stable position interface that uses stable node UUIDs instead of NodeKeys
 */
export interface StablePosition {
  stableNodeId: string;  // Stable UUID instead of unstable NodeKey
  offset: number;
  type: 'text' | 'element';
}

// ============================================================================
// CURSOR TYPES
// ============================================================================

export interface CursorProps {
  peerId: string;
  position: { top: number; left: number };
  color: string;
  name: string;
  isCurrentUser?: boolean;
  selection?: {
    rects: Array<{ top: number; left: number; width: number; height: number }>;
  };
}

export interface RemoteCursor {
  peerId: PeerID;
  anchor?: {
    key: NodeKey;
    offset: number;
  };
  focus?: {
    key: NodeKey;
    offset: number;
  };
  user?: { name: string; color: string };
  domElements?: {
    caret: HTMLElement;
    selections: HTMLElement[];
  };
}

// ============================================================================
// COMMUNICATION TYPES
// ============================================================================

export interface LoroMessage {
  type: string;
  update?: number[];
  snapshot?: number[];
  docId?: string;
  clientId?: string;
  color?: string;
  position?: number;
  selection?: { start: number; end: number } | null;
  awareness?: number[];
  peerId?: string;
  awarenessState?: {
    anchor: Uint8Array | null;
    focus: Uint8Array | null;
    user: { name: string; color: string } | null;
  };
  data?: string; // Hex string for ephemeral updates
  event?: { // For ephemeral-event messages
    by: string;
    added: string[];
    updated: string[];
    removed: string[];
  };
  // For paragraph-added messages
  message?: string;
  addedBy?: string;
}

export interface LoroCollaborativePluginProps {
  websocketUrl: string;
  docId: string;
  onConnectionChange?: (connected: boolean) => void;
  onPeerIdChange?: (peerId: string) => void;
  onDisconnectReady?: (disconnectFn: () => void) => void;
  onAwarenessChange?: (awareness: Array<{peerId: string, userName: string, isCurrentUser?: boolean}>) => void;
  onInitialization?: (success: boolean) => void;
  onSendMessageReady?: (sendMessageFn: (message: any) => void) => void;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Control flag for differential updates to prevent decorator node reloading.
 * When true, uses sophisticated differential merging instead of wholesale setEditorState.
 * This prevents YouTube/Counter decorator nodes from reloading during collaborative editing.
 */
export const USE_DIFFERENTIAL_UPDATE = true;
