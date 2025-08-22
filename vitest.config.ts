/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/**/*.test.ts']
  },
  optimizeDeps: {
    exclude: ['loro-crdt']
  }
})
