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

const transport = await import('../../src/collab/loro/transport');

describe('the Loro transport', () => {
  let server: http.Server;
  let url: string;
  const seeded: string[] = [];

  beforeAll(async () => {
    const wss = new WebSocketServer({ noServer: true });
    wss.on('connection', transport.setupWSConnection);
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
});
