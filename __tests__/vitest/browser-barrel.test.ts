/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { expect, it, vi } from 'vitest';

// A page bundles the transport's barrel: neither Lexical nor Node's http may come with it.
vi.mock('lexical', () => {
  throw new Error('The browser transport imported lexical.');
});
vi.mock('http', () => {
  throw new Error('The browser transport imported http.');
});

it('the browser transport loads without Lexical and without Node', async () => {
  const transport = await import('../../src/collab/loro/transport');
  expect(typeof transport.WebsocketProvider).toBe('function');
  expect('setupWSConnection' in transport).toBe(false);
});
