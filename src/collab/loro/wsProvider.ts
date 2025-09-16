import {LoroDoc} from 'loro-crdt';
import {WebsocketProvider} from './provider/websocket';
import { Provider } from './State';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const WEBSOCKET_ENDPOINT =
  params.get('collabEndpoint') || 'ws://localhost:1235';
const WEBSOCKET_SLUG = 'playground';
const WEBSOCKET_ID = params.get('collabId') || '0';

export function createWebsocketProvider(
  id: string,
  docMap: Map<string, LoroDoc>,
): Provider {
  let doc = docMap.get(id);

  if (doc === undefined) {
    doc = new LoroDoc();
    docMap.set(id, doc);
  }

  const websocketProvider = new WebsocketProvider(
    WEBSOCKET_ENDPOINT,
    WEBSOCKET_SLUG + '/' + WEBSOCKET_ID + '/' + id,
    doc,
    {
      connect: false,
    },
  );
  return websocketProvider;
}
