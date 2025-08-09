/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {LoroDoc} from 'loro-crdt';
import type { Provider } from '..';

// Simple in-memory Loro provider for demonstration/testing
// This is a legacy provider that simulates collaboration without a real server
export function createMockLoroProvider(roomId: string): Provider {
  const _doc = new LoroDoc();

  // Create a simple awareness implementation
  const awarenessStates = new Map<number, object>();
  const awarenessCallbacks: ((arg: {states: Map<number, object>}) => void)[] = [];

  const awareness = {
    getLocalState: () => awarenessStates.get(0) || null,
    getStates: () => awarenessStates,
    off: (type: string, listener: (arg: {states: Map<number, object>}) => void) => {
      const index = awarenessCallbacks.indexOf(listener);
      if (index !== -1) {
        awarenessCallbacks.splice(index, 1);
      }
    },
    on: (type: string, listener: (arg: {states: Map<number, object>}) => void) => {
      awarenessCallbacks.push(listener);
      return () => {
        const index = awarenessCallbacks.indexOf(listener);
        if (index !== -1) {
          awarenessCallbacks.splice(index, 1);
        }
      };
    },
    setLocalState: (state: object) => {
      awarenessStates.set(0, state);
      awarenessCallbacks.forEach(cb => cb({states: awarenessStates}));
    },
  };

  // Store event callbacks
  const syncCallbacks: ((isSynced: boolean) => void)[] = [];
  const statusCallbacks: ((arg0: {status: string}) => void)[] = [];
  const updateCallbacks: ((update: Uint8Array, origin: unknown) => void)[] = [];
  const reloadCallbacks: ((doc: unknown) => void)[] = [];

  const provider: Provider = {
    awareness,
    connect: () => {
      // Simulate connection
      setTimeout(() => {
        statusCallbacks.forEach((cb) => cb({status: 'connected'}));
        syncCallbacks.forEach((cb) => cb(true));
      }, 100);
    },
    disconnect: () => {
      // Simulate disconnection
      statusCallbacks.forEach((cb) => cb({status: 'disconnected'}));
      syncCallbacks.forEach((cb) => cb(false));
    },
    off: (type: string, cb: unknown) => {
      switch (type) {
        case 'sync': {
          const syncIndex = syncCallbacks.indexOf(
            cb as (isSynced: boolean) => void,
          );
          if (syncIndex !== -1) {
            syncCallbacks.splice(syncIndex, 1);
          }
          break;
        }
        case 'status': {
          const statusIndex = statusCallbacks.indexOf(
            cb as (arg0: {status: string}) => void,
          );
          if (statusIndex !== -1) {
            statusCallbacks.splice(statusIndex, 1);
          }
          break;
        }
        case 'update': {
          const updateIndex = updateCallbacks.indexOf(
            cb as (update: Uint8Array, origin: unknown) => void,
          );
          if (updateIndex !== -1) {
            updateCallbacks.splice(updateIndex, 1);
          }
          break;
        }
        case 'reload': {
          const reloadIndex = reloadCallbacks.indexOf(
            cb as (doc: unknown) => void,
          );
          if (reloadIndex !== -1) {
            reloadCallbacks.splice(reloadIndex, 1);
          }
          break;
        }
      }
    },
    on: (type: string, cb: unknown) => {
      switch (type) {
        case 'sync': {
          syncCallbacks.push(cb as (isSynced: boolean) => void);
          return () => {
            const index = syncCallbacks.indexOf(
              cb as (isSynced: boolean) => void,
            );
            if (index !== -1) {
              syncCallbacks.splice(index, 1);
            }
          };
        }
        case 'status': {
          statusCallbacks.push(cb as (arg0: {status: string}) => void);
          return () => {
            const index = statusCallbacks.indexOf(
              cb as (arg0: {status: string}) => void,
            );
            if (index !== -1) {
              statusCallbacks.splice(index, 1);
            }
          };
        }
        case 'update': {
          updateCallbacks.push(cb as (update: Uint8Array, origin: unknown) => void);
          return () => {
            const index = updateCallbacks.indexOf(
              cb as (update: Uint8Array, origin: unknown) => void,
            );
            if (index !== -1) {
              updateCallbacks.splice(index, 1);
            }
          };
        }
        case 'reload': {
          reloadCallbacks.push(cb as (doc: unknown) => void);
          return () => {
            const index = reloadCallbacks.indexOf(cb as (doc: unknown) => void);
            if (index !== -1) {
              reloadCallbacks.splice(index, 1);
            }
          };
        }
        default: {
          return () => {};
        }
      }
    },
  };

  return provider;
}
