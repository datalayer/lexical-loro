/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {LoroDoc} from 'loro-crdt';
import type { Provider } from '..';
import { LoroWebsocketProvider } from './loro-ws-provider';

// Create a WebSocket-based Loro provider for real-time collaboration
export function createLoroProvider(roomId: string, doc?: LoroDoc): Provider {
  // Use provided document or create a new one
  const loroDoc = doc || new LoroDoc();
  
  // Create WebSocket provider connecting to localhost:1234
  const wsProvider = new LoroWebsocketProvider(
    'ws://localhost:1234',
    roomId,
    loroDoc,
    {
      connect: true,
      resyncInterval: 30000, // Resync every 30 seconds
      maxBackoffTime: 5000,  // Max 5 seconds backoff
    }
  );

  return wsProvider;
}
