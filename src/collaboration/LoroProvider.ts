/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroDoc } from 'loro-crdt';

/**
 * Provider interface for Loro collaboration.
 * Similar to YJS Provider but adapted for Loro WebSocket communication.
 */
export interface LoroProvider {
  doc: LoroDoc;
  connected: boolean;
  websocketUrl: string;
  docId: string;
  clientId: string;

  /**
   * Connect to the collaboration server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the collaboration server
   */
  disconnect(): void;

  /**
   * Register event listeners
   */
  on(event: 'connect' | 'disconnect' | 'sync' | 'update', callback: (data?: any) => void): void;
  off(event: 'connect' | 'disconnect' | 'sync' | 'update', callback: (data?: any) => void): void;

  /**
   * Send an update to other clients
   */
  sendUpdate(update: Uint8Array): void;

  /**
   * Apply an update from another client
   */
  applyUpdate(update: Uint8Array): void;
}

/**
 * Create a Loro provider for WebSocket collaboration
 */
export function createLoroProvider(
  websocketUrl: string,
  docId: string,
  doc: LoroDoc
): LoroProvider {
  let websocket: WebSocket | null = null;
  const listeners = new Map<string, Set<(data?: any) => void>>();
  
  const provider: LoroProvider = {
    doc,
    connected: false,
    websocketUrl,
    docId,
    clientId: doc.peerIdStr,

    async connect() {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        return;
      }

      return new Promise<void>((resolve, reject) => {
        const wsUrl = `${websocketUrl}/${docId}`;
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          provider.connected = true;
          emit('connect');
          resolve();
        };

        websocket.onclose = () => {
          provider.connected = false;
          emit('disconnect');
        };

        websocket.onerror = (error) => {
          reject(error);
        };

        websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'update' && message.update) {
              // Convert base64 update to Uint8Array and apply
              const updateBytes = new Uint8Array(
                atob(message.update).split('').map(c => c.charCodeAt(0))
              );
              provider.applyUpdate(updateBytes);
            }
          } catch (error) {
            console.error('❌ Failed to process WebSocket message:', error);
          }
        };
      });
    },

    disconnect() {
      if (websocket) {
        websocket.close();
        websocket = null;
      }
      provider.connected = false;
    },

    on(event, callback) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    },

    off(event, callback) {
      const eventListeners = listeners.get(event);
      if (eventListeners) {
        eventListeners.delete(callback);
      }
    },

    sendUpdate(update) {
      if (websocket && websocket.readyState === WebSocket.OPEN) {
        // Convert Uint8Array to base64 for transmission
        const base64Update = btoa(String.fromCharCode(...update));
        websocket.send(JSON.stringify({
          type: 'update',
          docId,
          clientId: provider.clientId,
          update: base64Update
        }));
      }
    },

    applyUpdate(update) {
      doc.import(update);
      emit('update', update);
    }
  };

  function emit(event: string, data?: any) {
    const eventListeners = listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => callback(data));
    }
  }

  return provider;
}
