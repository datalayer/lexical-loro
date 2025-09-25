import {LoroDoc} from 'loro-crdt';
import {WebsocketProvider} from './provider/websocket';
import { Provider } from './State';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const WEBSOCKET_ENDPOINT =
  params.get('collabEndpoint') || 'ws://localhost:3002';
const WEBSOCKET_SLUG = 'playground';
const WEBSOCKET_ID = params.get('collabId') || '0';
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
  const finalWebsocketUrl = websocketUrl || (() => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    return params.get('collabEndpoint') || 'ws://localhost:3002';
  })();
  
  const websocketProvider = new WebsocketProvider(
    finalWebsocketUrl,
    WEBSOCKET_SLUG + '/' + WEBSOCKET_ID + '/' + id,
    doc,
    {
      connect: false,
      resyncInterval: RESYNC_INTERVAL, // Poll ephemeral state periodically to prevent stale user accumulation
    },
  );
  
  console.log(`🏭 WebsocketProvider created for: ${finalWebsocketUrl}/${WEBSOCKET_SLUG}/${WEBSOCKET_ID}/${id} with resyncInterval: ${RESYNC_INTERVAL}ms`);
  return websocketProvider;
}
