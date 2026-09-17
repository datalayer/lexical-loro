/*
 * Copyright (c) 2021-Present Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The example's entry point.
 *
 * Mounts {@link LoroExample} inside Primer's theme provider. The editor and
 * everything around it come from `@datalayer/jupyter-lexical`, which brings
 * its own plugins, nodes and styles — so there is nothing to set up here
 * beyond a root and a theme.
 *
 * @module demo
 */

/*
  Prism, before anything that highlights code.

  `@lexical/code` reads `window.Prism` at import time, so this has to come
  first — the same import `@datalayer/jupyter-lexical`'s own examples make.
*/
import '@datalayer/jupyter-react/lib/css/PrismCss';

/*
  The editor's own styles: the theme classes, the toolbar, the debug tree
  view. jupyter-lexical's examples import them the same way; without them
  the page is bare text.
*/
import '@datalayer/jupyter-lexical/style/index.css';

import { createRoot } from 'react-dom/client';
import { DatalayerThemeProvider } from '@datalayer/primer-addons';
import { LoroExample } from './example/LoroExample';

/** Runtime errors, in Vite's own overlay rather than only in the console. */
const showErrorOverlay = (err: unknown) => {
  const ErrorOverlay = customElements.get('vite-error-overlay');
  if (!ErrorOverlay) {
    return;
  }
  document.body?.appendChild(new ErrorOverlay(err));
};

window.addEventListener('error', showErrorOverlay);
window.addEventListener('unhandledrejection', ({ reason }) =>
  showErrorOverlay(reason),
);

createRoot(document.getElementById('root') as HTMLElement).render(
  <DatalayerThemeProvider colorMode="light">
    <LoroExample />
  </DatalayerThemeProvider>,
);
