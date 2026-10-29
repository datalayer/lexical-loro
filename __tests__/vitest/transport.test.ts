/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import http from 'http';
import { LoroDoc } from 'loro-crdt';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

// The transport must run without Lexical: loading it fails the test if anything pulls Lexical in.
vi.mock('lexical', () => {
  throw new Error('The transport imported lexical.');
});

// The browser barrel (the provider) and the server's rooms (Node), both without Lexical.
const transport = {
  ...(await import('../../src/collab/loro/transport')),
  ...(await import('../../src/collab/loro/transport/server')),
};

describe('the Loro transport', () => {
  let server: http.Server;
  let url: string;
  const seeded: string[] = [];
  /** The server's side of every connection, in the order they came. */
  const accepted: import('ws').WebSocket[] = [];
  /** The connections (by their place in `accepted`) that asked for the snapshot. */
  const askedSnapshot = new Set<number>();

  beforeAll(async () => {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', (ws, req) => {
      accepted.push(ws);
      const at = accepted.length - 1;
      ws.on('message', (m) => {
        if (String(m).includes('"query-snapshot"')) askedSnapshot.add(at);
      });
      transport.setupWSConnection(ws, req);
    });
    server = http.createServer((_req, res) => res.end('okay'));
    server.on('upgrade', (req, socket, head) =>
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req)),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    url = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const room of transport.docs.values()) for (const conn of room.conns.keys()) conn.close();
    // A socket a test silenced never finishes its close handshake: drop it.
    for (const ws of accepted) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
  });

  it('loads without Lexical, and its rooms start empty unless seeded', () => {
    expect(typeof transport.WebsocketProvider).toBe('function');
    const plain = transport.getDoc('plain');
    expect(plain.doc.toJSON()).toEqual({});
    transport.setRoomSeeder((doc, name) => {
      seeded.push(name);
      doc.getMap('workbook').set('version', 1);
    });
    expect(transport.getDoc('seeded').doc.getMap('workbook').get('version')).toBe(1);
    expect(seeded).toEqual(['seeded']);
    transport.setRoomSeeder(() => {});
  });

  it('carries updates between two peers of a room, through the ws server', async () => {
    const a = new LoroDoc();
    const b = new LoroDoc();
    const options = { disableBc: true, WebSocketPolyfill: WebSocket };
    const pa = new transport.WebsocketProvider(url, 'room', a, options);
    const pb = new transport.WebsocketProvider(url, 'room', b, options);
    try {
      await vi.waitFor(() => expect(pa.wsconnected && pb.wsconnected).toBe(true), { timeout: 5000 });
      a.getMap('cells').set('0.0', 42);
      a.commit();
      await vi.waitFor(() => expect(b.getMap('cells').get('0.0')).toBe(42), { timeout: 5000 });
    } finally {
      pa.destroy();
      pb.destroy();
    }
  });

  it('catches up on a reconnect after a silent socket, though the old socket has not closed yet', async () => {
    const a = new LoroDoc();
    const b = new LoroDoc();
    const options = { disableBc: true, WebSocketPolyfill: WebSocket };
    const pa = new transport.WebsocketProvider(url, 'gap', a, options);
    await vi.waitFor(() => expect(pa.synced).toBe(true), { timeout: 5000 });
    const pb = new transport.WebsocketProvider(url, 'gap', b, options);
    try {
      await vi.waitFor(() => expect(pb.synced).toBe(true), { timeout: 5000 });
      const bServer = accepted[accepted.length - 1];
      // B's socket goes silent, as an idle one behind a proxy does: the room stops relaying to
      // it, and its server side stops reading, so B's close handshake hangs and its close
      // event does not come before B's next socket opens.
      const room = transport.docs.get('gap')!;
      room.conns.delete(bServer as never);
      (bServer as unknown as { _socket: { pause(): void } })._socket.pause();
      // A edits while B is between sockets.
      a.getMap('cells').set('0.0', 42);
      a.commit();
      // B's watchdog finds the socket silent (no message for 30 s) and opens another.
      const before = accepted.length;
      pb.wsLastMessageReceived = 0;
      await vi.waitFor(() => expect(accepted.length).toBe(before + 1), { timeout: 8000 });
      // The new socket asks for the snapshot: a relay that answers only that (Spacer does not
      // send one on connect, as this test's server does) is how B learns what it missed.
      await vi.waitFor(() => expect(askedSnapshot.has(before)).toBe(true), { timeout: 3000 });
      await vi.waitFor(() => expect(b.getMap('cells').get('0.0')).toBe(42), { timeout: 5000 });
    } finally {
      pa.destroy();
      pb.destroy();
    }
  }, 15_000);
});
