/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {Doc} from 'yjs';
import {WebsocketProvider} from './provider/websocket';
import { Provider } from './services';

const url = new URL(window.location.href);
const params = new URLSearchParams(url.search);
const WEBSOCKET_ENDPOINT =
  params.get('collabEndpoint') || 'ws://localhost:1234';
const WEBSOCKET_SLUG = 'playground';
const WEBSOCKET_ID = params.get('collabId') || '0';

// parent dom -> child doc
export function createWebsocketProvider(
  id: string,
  docMap: Map<string, Doc>,
): Provider {
  let doc = docMap.get(id);

  if (doc === undefined) {
    doc = new Doc();
    docMap.set(id, doc);
  } else {
    doc.load();
  }

  return new WebsocketProvider(
    WEBSOCKET_ENDPOINT,
    WEBSOCKET_SLUG + '/' + WEBSOCKET_ID + '/' + id,
    doc,
    {
      connect: false,
    },
  );
}
