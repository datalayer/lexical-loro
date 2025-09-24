import {createRoot} from 'react-dom/client';
// setupEnv must load before App because lexical computes CAN_USE_BEFORE_INPUT
// at import time (disableBeforeInput is used to test legacy events)
import setupEnv from './setupEnv';

// Initialize Prism.js for code highlighting
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';

// Make Prism globally available
(window as any).Prism = Prism;

import App from './App';

import './index.css';

if (setupEnv.disableBeforeInput) {
  // vite is really aggressive about tree-shaking, this
  // ensures that the side-effects of importing setupEnv happens
}

// Handle runtime errors
const showErrorOverlay = (err: Event) => {
  const ErrorOverlay = customElements.get('vite-error-overlay');
  if (!ErrorOverlay) {
    return;
  }
  const overlay = new ErrorOverlay(err);
  const body = document.body;
  if (body !== null) {
    body.appendChild(overlay);
  }
};

window.addEventListener('error', showErrorOverlay);
window.addEventListener('unhandledrejection', ({reason}) =>
  showErrorOverlay(reason),
);

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
