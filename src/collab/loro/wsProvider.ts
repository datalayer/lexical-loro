/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import {LoroDoc} from 'loro-crdt';
import {WebsocketProvider} from './provider/websocket';
import { Provider } from './State';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const RESYNC_INTERVAL = parseInt(params.get('resyncInterval') || '30000', 10); // Default 30s, configurable via URL

/**
 * Create a WebSocket provider for Loro collaboration with periodic ephemeral state synchronization.
 * The resyncInterval enables client-side periodic querying to complement server-side cleanup,
 * preventing stale user states from accumulating after browser refreshes.
 */
export function createWebsocketProvider(
  id: string,
  docMap: Map<string, LoroDoc>,
  websocketUrl?: string,
): Provider {
  let doc = docMap.get(id);

  if (doc === undefined) {
    doc = new LoroDoc();
    docMap.set(id, doc);
  }

  const providerInstanceId = Math.random().toString(36).substr(2, 9);
  console.log(`🏭 Creating WebsocketProvider instance (ID: ${providerInstanceId}) for docId: ${id}`);
  
  // Use provided websocketUrl or fallback to URL parameters/defaults
  const rawWebsocketUrl = websocketUrl || (() => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    return params.get('collabEndpoint') || 'ws://localhost:3002';
  })();

  // The WebsocketProvider builds the connection URL as
  // `serverUrl + '/' + docId + '?' + params`. If the caller embedded a query
  // string (for example `?token=<jwt>`) directly in the URL, the docId would be
  // appended *after* the query string, corrupting the URL. Split any query
  // string off the base URL and forward it through the provider `params` so the
  // final URL is `serverUrl/docId?token=<jwt>` as the server expects.
  let finalWebsocketUrl = rawWebsocketUrl;
  const params: Record<string, string> = {};
  const queryIndex = finalWebsocketUrl.indexOf('?');
  if (queryIndex !== -1) {
    const query = finalWebsocketUrl.slice(queryIndex + 1);
    finalWebsocketUrl = finalWebsocketUrl.slice(0, queryIndex);
    new URLSearchParams(query).forEach((value, key) => {
      params[key] = value;
    });
  }

  const websocketProvider = new WebsocketProvider(
    finalWebsocketUrl,
    id,
    doc,
    {
      connect: false,
      params,
      resyncInterval: RESYNC_INTERVAL, // Poll ephemeral state periodically to prevent stale user accumulation
    },
  );
  
  console.log(`🏭 WebsocketProvider created for: ${finalWebsocketUrl}/${id} with resyncInterval: ${RESYNC_INTERVAL}ms`);
  return websocketProvider;
}
