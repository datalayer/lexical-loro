// Vitest setup for Lexical-Loro tests
import { vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Create a JSDOM environment with proper location
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

// Setup global window and document
global.window = dom.window as any;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

// Polyfill TextEncoder/TextDecoder for Node.js environment
if (typeof global.TextEncoder === 'undefined') {
  const util = await import('util');
  global.TextEncoder = util.TextEncoder as any;
  global.TextDecoder = util.TextDecoder as any;
}

// Mock DOM APIs that Lexical needs
Object.defineProperty(window, 'getSelection', {
  writable: true,
  configurable: true,
  value: vi.fn()
});

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  configurable: true,
  value: vi.fn(() => ({
    getPropertyValue: vi.fn()
  }))
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock MutationObserver
global.MutationObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock Range for selection support
global.Range = dom.window.Range as any;

// Suppress console warnings for tests
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  console.warn = vi.fn();
  console.error = vi.fn();
});

afterEach(() => {
  console.warn = originalWarn;
  console.error = originalError;
});
