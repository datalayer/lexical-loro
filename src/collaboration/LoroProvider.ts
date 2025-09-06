/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import type { LoroDoc } from 'loro-crdt';
import type { LoroAwareness } from './LoroBinding';

/**
 * Provider interface for Loro collaboration.
 * Following YJS Provider pattern with Loro-specific adaptations.
 */
export interface LoroProvider {
  doc: LoroDoc;
  connected: boolean;
  websocketUrl: string;
  docId: string;
  clientId: string;
  awareness?: LoroAwareness; // YJS-style awareness for user presence

  /**
   * Connect to the collaboration server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the collaboration server
   */
  disconnect(): void;

  /**
   * Register event listeners (YJS-style events + Loro-specific events)
   */
  on(event: 'connect' | 'disconnect' | 'sync' | 'update' | 'status' | 'reload' | 'initial-content' | 'welcome' | 'peerUpdate', callback: (data?: any) => void): void;
  off(event: 'connect' | 'disconnect' | 'sync' | 'update' | 'status' | 'reload' | 'initial-content' | 'welcome' | 'peerUpdate', callback: (data?: any) => void): void;

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
          emit('status', { status: 'connected' }); // For compatibility with useLoroCollaboration
          resolve();
        };

        websocket.onclose = () => {
          provider.connected = false;
          emit('disconnect');
          emit('status', { status: 'disconnected' }); // For compatibility with useLoroCollaboration
        };

        websocket.onerror = (error) => {
          reject(error);
        };

        websocket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            const timestamp = new Date().toISOString();
            const browserId = provider.clientId.slice(-4);
            console.log(`📨 [PROVIDER-${browserId}] Received WebSocket message at ${timestamp}:`, {
              type: message.type,
              from: message.clientId || 'server',
              docId: message.docId,
              messageSize: event.data.length
            });
            
            if (message.type === 'update' && message.update) {
              // Convert base64 update to Uint8Array and apply
              const updateBytes = new Uint8Array(
                atob(message.update).split('').map(c => c.charCodeAt(0))
              );
              
              const fromBrowserId = message.clientId ? message.clientId.slice(-4) : 'UNKN';
              console.log(`🔄 [PROVIDER-${browserId}] Processing update from ${fromBrowserId}:`, {
                updateSize: updateBytes.length,
                base64Size: message.update.length,
                updatePreview: Array.from(updateBytes.slice(0, 10)),
                fromClient: message.clientId,
                ourClientId: provider.clientId,
                isFromUs: message.clientId === provider.clientId
              });
              
              // Don't apply updates that originated from this client (avoid echo)
              if (message.clientId !== provider.clientId) {
                provider.applyUpdate(updateBytes);
                console.log(`✅ [PROVIDER-${browserId}] Update applied successfully`);
              } else {
                console.log(`⏭️ [PROVIDER-${browserId}] Skipping our own update (echo prevention)`);
              }
            } else if (message.type === 'initial-content' && message.content) {
              // Handle initial content from server (Lexical JSON state)
              console.log(`📋 [PROVIDER-${browserId}] Received initial content from server:`, {
                contentLength: message.content.length,
                contentPreview: message.content.substring(0, 100)
              });
              emit('initial-content', { content: message.content });
            } else if (message.type === 'welcome') {
              // Handle welcome message
              console.log(`👋 [PROVIDER-${browserId}] Welcome message received:`, message.message);
              emit('welcome', message);
            } else if (message.type === 'peerUpdate') {
              // Handle peer update message
              console.log(`👥 [PROVIDER-${browserId}] Peer update received:`, {
                peerCount: message.peerCount,
                peers: message.peers?.length || 0
              });
              emit('peerUpdate', message);
            } else {
              console.log(`❓ [PROVIDER-${browserId}] Unknown message type:`, message.type);
            }
          } catch (error) {
            const browserId = provider.clientId.slice(-4);
            console.error(`❌ [PROVIDER-${browserId}] Failed to process WebSocket message:`, error);
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
      emit('status', { status: 'disconnected' }); // For compatibility with useLoroCollaboration
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
        const timestamp = new Date().toISOString();
        const browserId = provider.clientId.slice(-4);
        
        const message = {
          type: 'update',
          docId,
          clientId: provider.clientId,
          update: base64Update
        };
        
        console.log(`🚀 [PROVIDER-${browserId}] Sending update to server at ${timestamp}:`, {
          updateSize: update.length,
          base64Size: base64Update.length,
          updatePreview: Array.from(update.slice(0, 10)),
          clientId: provider.clientId,
          docId,
          websocketState: websocket.readyState
        });
        
        websocket.send(JSON.stringify(message));
        console.log(`✅ [PROVIDER-${browserId}] Update sent to WebSocket`);
      } else {
        const browserId = provider.clientId.slice(-4);
        console.warn(`⚠️ [PROVIDER-${browserId}] Cannot send update - WebSocket not connected:`, {
          websocketExists: !!websocket,
          readyState: websocket?.readyState,
          connected: provider.connected
        });
      }
    },

    applyUpdate(update) {
      const timestamp = new Date().toISOString();
      const browserId = provider.clientId.slice(-4);
      console.log(`🔧 [PROVIDER-${browserId}] Applying update at ${timestamp}:`, {
        updateSize: update.length,
        updatePreview: Array.from(update.slice(0, 10))
      });
      
      try {
        doc.import(update);
        console.log(`✅ [PROVIDER-${browserId}] Update imported to Loro doc successfully`);
        emit('update', update);
        console.log(`📡 [PROVIDER-${browserId}] Update event emitted to listeners`);
      } catch (error) {
        console.error(`❌ [PROVIDER-${browserId}] Failed to import update:`, error);
      }
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
