/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import react from '@vitejs/plugin-react';
import {createRequire} from 'node:module';
import {defineConfig} from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

import viteCopyEsm from './viteCopyEsm';
import viteCopyExcalidrawAssets from './viteCopyExcalidrawAssets';

const require = createRequire(import.meta.url);

// https://vitejs.dev/config/
export default defineConfig(({mode}) => ({
  build: {
    // Keep a modern output target so vite-plugin-top-level-await does not
    // trigger unsupported downlevel transforms in esbuild.
    target: 'esnext',
    outDir: 'build',
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        split: new URL('./split/index.html', import.meta.url).pathname,
      },
    },
    ...(mode === 'production' && {
      minify: 'terser',
      terserOptions: {
        compress: {
          toplevel: true,
        },
        keep_classnames: true,
      },
    }),
  },
  define: {
    /*
      JupyterLab's packages are built for webpack and read globals it
      provides. The same three are defined in `@datalayer/jupyter-lexical`'s
      own Vite config, which is where the editor in this example comes from.
    */
    global: 'globalThis',
    __webpack_public_path__: '""',
    'process.env': {},
  },
  resolve: {
    alias: [
      /*
        JupyterLab's own stylesheets use webpack's `~` prefix to mean "from
        node_modules" — `@import '~react-toastify/…'` in
        `@jupyterlab/apputils-extension`. Vite's CSS pipeline reads that as a
        relative path and fails on it. The example reaches those styles through
        `@datalayer/jupyter-lexical`, whose own Vite config strips the prefix
        the same way.
      */
      {find: /^~(.*)$/, replacement: '$1'},
    ],
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  server: {
    fs: {
      // The workspace hoists dependencies to `src/node_modules`, several
      // levels above this package.
      allow: [new URL('../../../', import.meta.url).pathname],
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
      treeShaking: true,
      // jupyter-react's ipywidgets embed puts an AMD `define` on the page, and
      // a UMD module in the pre-bundle (es6-promise-pool, behind the kernel
      // pool) then registers with AMD instead of setting `module.exports` —
      // its ESM default is an empty object. Inside the pre-bundle, no AMD.
      define: { 'define.amd': 'undefined' },
    },
    exclude: ['loro-crdt'], // Don't pre-bundle loro-crdt to avoid WASM issues
  },
  plugins: [
    /*
      Two shapes of import that reach this example through
      `@datalayer/jupyter-lexical`, and that Vite does not know on its own.
      Both are handled the same way in that package's own config.
    */
    {
      // jupyter-react reads its Lite service worker as text
      // (`import SW_URL from './service-worker?text'`); Vite spells that `?raw`.
      name: 'fix-text-query',
      enforce: 'pre',
      async resolveId(source: string, importer: string | undefined) {
        if (!source.includes('?text')) {
          return null;
        }
        const fixed = source.replace('?text', '?raw');
        const resolved = await this.resolve(fixed, importer, {skipSelf: true});
        return resolved ? resolved.id : fixed;
      },
    },
    {
      // A `.raw.css` file is meant to arrive as a string, not as a stylesheet.
      name: 'raw-css-as-string',
      enforce: 'pre',
      async resolveId(source: string, importer: string | undefined) {
        if (!source.endsWith('.raw.css') || source.includes('?raw')) {
          return null;
        }
        const resolved = await this.resolve(source + '?raw', importer, {
          skipSelf: true,
        });
        return resolved ? resolved.id : null;
      },
    },
    react(),
    viteCopyEsm(),
    babel({
      babelHelpers: 'bundled',
      babelrc: false,
      configFile: false,
      exclude: '**/node_modules/**',
      extensions: ['jsx', 'js', 'ts', 'tsx', 'mjs'],
      plugins: [
        '@babel/plugin-transform-flow-strip-types',
        ...(mode !== 'production'
          ? []
          : []),
      ],
      presets: [['@babel/preset-react', {runtime: 'automatic'}]],
    }),
    ...viteCopyExcalidrawAssets(),
    wasm(),
    topLevelAwait(),
    commonjs({
      // This is required for React 19 (at least 19.0.0-beta-26f2496093-20240514)
      // because @rollup/plugin-commonjs does not analyze it correctly
      strictRequires: [/\/node_modules\/(react-dom|react)\/[^/]\.js$/],
    }),
  ],
}));
