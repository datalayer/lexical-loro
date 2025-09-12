/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {LoroDoc} from 'loro-crdt';
import {WebsocketProvider} from './provider/websocket';
import { Provider } from './State';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const WEBSOCKET_ENDPOINT =
  params.get('collabEndpoint') || 'ws://localhost:1235';
const WEBSOCKET_SLUG = 'playground';
const WEBSOCKET_ID = params.get('collabId') || '0';

// parent dom -> child doc
export function createWebsocketProvider(
  id: string,
  loroDocMap: Map<string, LoroDoc>,
): Provider {
  let doc = loroDocMap.get(id);

  if (doc === undefined) {
    doc = new LoroDoc();
    loroDocMap.set(id, doc);
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
