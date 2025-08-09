/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { LoroDoc } from 'loro-crdt';
import type { Provider } from '..';

export interface LoroWebsocketProviderOptions {
  connect?: boolean;
  params?: Record<string, string>;
  protocols?: string[];
  WebSocketPolyfill?: typeof WebSocket;
  resyncInterval?: number;
  maxBackoffTime?: number;
}

export class LoroWebsocketProvider implements Provider {
  private serverUrl: string;
  private roomname: string;
  private doc: LoroDoc;
  private ws: WebSocket | null = null;
  private wsconnected = false;
  private wsconnecting = false;
  private shouldConnect = true;
  private wsUnsuccessfulReconnects = 0;
  private maxBackoffTime = 2500;
  private params: Record<string, string> = {};
  private protocols: string[] = [];
  private WebSocketPolyfill: typeof WebSocket;
  private resyncInterval = -1;
  private resyncIntervalId: number | null = null;
  private userId: string;
  private lastVersion: any = null; // Track the last version we sent

  // Event callbacks
  private syncCallbacks: ((isSynced: boolean) => void)[] = [];
  private statusCallbacks: ((arg: { status: string }) => void)[] = [];
  private updateCallbacks: ((update: Uint8Array, origin: unknown) => void)[] = [];
  private reloadCallbacks: ((doc: unknown) => void)[] = [];

  // Awareness implementation
  private awarenessStates = new Map<string, object>();
  private awarenessCallbacks: ((arg: { states: Map<number, object> }) => void)[] = [];

  public awareness = {
    getLocalState: () => this.awarenessStates.get(this.userId) || null,
    getStates: () => {
      // Convert string keys to number keys for compatibility
      const numericStates = new Map<number, object>();
      this.awarenessStates.forEach((state, key) => {
        numericStates.set(parseInt(key) || 0, state);
      });
      return numericStates;
    },
    off: (type: string, listener: (arg: { states: Map<number, object> }) => void) => {
      const index = this.awarenessCallbacks.indexOf(listener);
      if (index !== -1) {
        this.awarenessCallbacks.splice(index, 1);
      }
    },
    on: (type: string, listener: (arg: { states: Map<number, object> }) => void) => {
      this.awarenessCallbacks.push(listener);
      return () => {
        const index = this.awarenessCallbacks.indexOf(listener);
        if (index !== -1) {
          this.awarenessCallbacks.splice(index, 1);
        }
      };
    },
    setLocalState: (state: object) => {
      this.awarenessStates.set(this.userId, state);
      this.sendAwareness(state);
      this.notifyAwarenessChange();
    },
  };

  constructor(
    serverUrl: string,
    roomname: string,
    doc: LoroDoc,
    options: LoroWebsocketProviderOptions = {}
  ) {
    const {
      connect = true,
      params = {},
      protocols = [],
      WebSocketPolyfill = WebSocket,
      resyncInterval = -1,
      maxBackoffTime = 2500,
    } = options;

    // Ensure serverUrl doesn't end with /
    while (serverUrl[serverUrl.length - 1] === '/') {
      serverUrl = serverUrl.slice(0, serverUrl.length - 1);
    }

    this.serverUrl = serverUrl;
    this.roomname = roomname;
    this.doc = doc;
    this.params = params;
    this.protocols = protocols;
    this.WebSocketPolyfill = WebSocketPolyfill;
    this.resyncInterval = resyncInterval;
    this.maxBackoffTime = maxBackoffTime;
    this.shouldConnect = connect;
    this.userId = Math.random().toString(36).substr(2, 9); // Generate random user ID

    // Set up document update handler
    this.doc.subscribe((event) => {
      console.log('Loro document subscription triggered:', { 
        by: event.by, 
        wsconnected: this.wsconnected,
        event 
      });
      
      if (event.by !== 'import' && this.wsconnected) {
        // Get incremental update since last version
        try {
          const currentVersion = this.doc.version();
          let update: Uint8Array;
          
          if (this.lastVersion) {
            update = this.doc.exportFrom(this.lastVersion);
          } else {
            update = this.doc.exportFrom();
          }
          
          if (update.length > 0) {
            this.sendUpdate(update);
            this.updateCallbacks.forEach(cb => cb(update, this));
            this.lastVersion = currentVersion;
            console.log('Sending document update to server, new version:', currentVersion);
          }
        } catch (error) {
          console.error('Error handling document update:', error);
          // Fallback to full export
          const update = this.doc.exportFrom();
          if (update.length > 0) {
            this.sendUpdate(update);
            this.updateCallbacks.forEach(cb => cb(update, this));
          }
        }
      }
    });

    // Start connection after a short delay to allow React to stabilize
    if (this.shouldConnect) {
      setTimeout(() => {
        if (this.shouldConnect) {
          this.connect();
        }
      }, 100);
    }

    if (this.resyncInterval > 0) {
      this.resyncIntervalId = window.setInterval(() => {
        if (this.wsconnected) {
          this.requestSync();
        }
      }, this.resyncInterval);
    }
  }

  private setupWebSocket() {
    if (this.wsconnecting || this.ws !== null) {
      return;
    }

    this.wsconnecting = true;

    // For WebSocket, we don't need URL params in the path
    const wsUrl = this.serverUrl;
    
    console.log('Connecting to WebSocket server:', wsUrl);
    this.ws = new this.WebSocketPolyfill(wsUrl, this.protocols);

    this.ws.onopen = () => {
      this.wsconnecting = false;
      this.wsconnected = true;
      this.wsUnsuccessfulReconnects = 0;
      
      // Initialize last version tracking
      this.lastVersion = this.doc.version();
      
      // Send join message
      const joinMessage = {
        type: 'join',
        docId: this.roomname,
        userId: this.userId,
      };
      console.log('Sending join message:', joinMessage);
      this.send(joinMessage);

      this.statusCallbacks.forEach(cb => cb({ status: 'connected' }));
      console.log(`Connected to Loro WebSocket server: ${this.serverUrl}`);
    };

    this.ws.onmessage = (event) => {
      console.log('Received WebSocket message:', event.data);
      this.handleMessage(event);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      this.handleClose(event);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.statusCallbacks.forEach(cb => cb({ status: 'disconnected' }));
    };
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      const { type, data, docId, userId } = message;

      switch (type) {
        case 'welcome':
          // Server welcome message - just log it
          console.log('Connected to Loro server:', message.message);
          break;

        case 'init':
          // Initial document state from server
          if (data && data.length > 0) {
            const updateBytes = new Uint8Array(data);
            this.doc.import(updateBytes);
            this.lastVersion = this.doc.version(); // Update version tracking
            this.syncCallbacks.forEach(cb => cb(true));
            console.log('Received initial document state, version:', this.lastVersion);
          }
          break;

        case 'update':
          // Document update from another client
          if (data && userId !== this.userId) {
            const updateBytes = new Uint8Array(data);
            this.doc.import(updateBytes);
            this.lastVersion = this.doc.version(); // Update version tracking
            this.updateCallbacks.forEach(cb => cb(updateBytes, userId));
            console.log('Applied update from user:', userId, 'new version:', this.lastVersion);
          }
          break;

        case 'awareness':
          // Awareness update from another client
          if (userId !== this.userId) {
            if (data && data.state) {
              this.awarenessStates.set(userId, data.state);
            } else {
              this.awarenessStates.delete(userId);
            }
            this.notifyAwarenessChange();
            console.log('Updated awareness for user:', userId);
          }
          break;

        case 'awareness-init':
          // Initial awareness state from server
          if (data) {
            Object.entries(data).forEach(([user, state]) => {
              if (user !== this.userId) {
                this.awarenessStates.set(user, state as object);
              }
            });
            this.notifyAwarenessChange();
            console.log('Received initial awareness state');
          }
          break;

        case 'error':
          console.error('Server error:', message.message);
          break;

        default:
          console.warn('Unknown message type:', type);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private handleClose(event: CloseEvent) {
    console.log('WebSocket connection closed:', event.code, event.reason);
    this.wsconnecting = false;
    this.ws = null;

    if (this.wsconnected) {
      this.wsconnected = false;
      this.statusCallbacks.forEach(cb => cb({ status: 'disconnected' }));
      this.syncCallbacks.forEach(cb => cb(false));
      
      // Clear remote awareness states
      this.awarenessStates.clear();
      this.notifyAwarenessChange();
      
      console.log('WebSocket disconnected, cleared remote awareness states');
    } else {
      this.wsUnsuccessfulReconnects++;
      console.log('WebSocket connection failed, unsuccessful reconnects:', this.wsUnsuccessfulReconnects);
    }

    if (this.shouldConnect && event.code !== 1000) { // Don't reconnect on normal close
      // Exponential backoff reconnection
      const backoffTime = Math.min(
        Math.pow(2, this.wsUnsuccessfulReconnects) * 100,
        this.maxBackoffTime
      );
      
      console.log(`Attempting to reconnect in ${backoffTime}ms...`);
      setTimeout(() => {
        if (this.shouldConnect) {
          this.setupWebSocket();
        }
      }, backoffTime);
    }
  }

  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log('Sending WebSocket message:', messageStr);
      this.ws.send(messageStr);
    } else {
      console.warn('WebSocket not ready, cannot send message:', message, 'ReadyState:', this.ws?.readyState);
    }
  }

  private sendUpdate(update: Uint8Array) {
    this.send({
      type: 'update',
      docId: this.roomname,
      userId: this.userId,
      data: Array.from(update),
    });
  }

  private sendAwareness(state: object) {
    this.send({
      type: 'awareness',
      docId: this.roomname,
      userId: this.userId,
      data: { state },
    });
  }

  private requestSync() {
    this.send({
      type: 'sync',
      docId: this.roomname,
      userId: this.userId,
    });
  }

  private notifyAwarenessChange() {
    const numericStates = this.awareness.getStates();
    this.awarenessCallbacks.forEach(cb => cb({ states: numericStates }));
  }

  // Provider interface implementation
  connect() {
    this.shouldConnect = true;
    if (!this.wsconnected && this.ws === null) {
      this.setupWebSocket();
    }
  }

  disconnect() {
    console.log('Disconnecting WebSocket provider');
    this.shouldConnect = false;
    
    if (this.ws !== null) {
      // Close with normal code to prevent reconnection
      this.ws.close(1000, 'Provider disconnected');
      this.ws = null;
    }
    
    if (this.resyncIntervalId !== null) {
      clearInterval(this.resyncIntervalId);
      this.resyncIntervalId = null;
    }
    
    this.wsconnected = false;
    this.wsconnecting = false;
  }

  off(type: string, cb: unknown) {
    switch (type) {
      case 'sync':
        const syncIndex = this.syncCallbacks.indexOf(cb as (isSynced: boolean) => void);
        if (syncIndex !== -1) {
          this.syncCallbacks.splice(syncIndex, 1);
        }
        break;
      case 'status':
        const statusIndex = this.statusCallbacks.indexOf(cb as (arg: { status: string }) => void);
        if (statusIndex !== -1) {
          this.statusCallbacks.splice(statusIndex, 1);
        }
        break;
      case 'update':
        const updateIndex = this.updateCallbacks.indexOf(cb as (update: Uint8Array, origin: unknown) => void);
        if (updateIndex !== -1) {
          this.updateCallbacks.splice(updateIndex, 1);
        }
        break;
      case 'reload':
        const reloadIndex = this.reloadCallbacks.indexOf(cb as (doc: unknown) => void);
        if (reloadIndex !== -1) {
          this.reloadCallbacks.splice(reloadIndex, 1);
        }
        break;
    }
  }

  on(type: string, cb: unknown) {
    switch (type) {
      case 'sync':
        this.syncCallbacks.push(cb as (isSynced: boolean) => void);
        return () => {
          const index = this.syncCallbacks.indexOf(cb as (isSynced: boolean) => void);
          if (index !== -1) {
            this.syncCallbacks.splice(index, 1);
          }
        };
      case 'status':
        this.statusCallbacks.push(cb as (arg: { status: string }) => void);
        return () => {
          const index = this.statusCallbacks.indexOf(cb as (arg: { status: string }) => void);
          if (index !== -1) {
            this.statusCallbacks.splice(index, 1);
          }
        };
      case 'update':
        this.updateCallbacks.push(cb as (update: Uint8Array, origin: unknown) => void);
        return () => {
          const index = this.updateCallbacks.indexOf(cb as (update: Uint8Array, origin: unknown) => void);
          if (index !== -1) {
            this.updateCallbacks.splice(index, 1);
          }
        };
      case 'reload':
        this.reloadCallbacks.push(cb as (doc: unknown) => void);
        return () => {
          const index = this.reloadCallbacks.indexOf(cb as (doc: unknown) => void);
          if (index !== -1) {
            this.reloadCallbacks.splice(index, 1);
          }
        };
      default:
        return () => {};
    }
  }
}
