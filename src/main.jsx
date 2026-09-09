import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider } from './components/Theme.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import App from './app.jsx';
import { createLogger } from './lib/logger.js';

const log = createLogger('boot');

// Catch-all so nothing fails silently in the browser console.
window.addEventListener('error', (e) => {
  log.error('uncaught error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno });
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandled promise rejection', { reason: e.reason?.message || String(e.reason) });
});

log.info('app booting', { mode: import.meta.env?.MODE, dev: !!import.meta.env?.DEV });

// Prepend Express backend API URL for relative requests when running in Tauri webview
if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/')) {
      input = 'http://localhost:3001' + input;
    }
    if (!init) init = {};
    init.credentials = 'include';
    return originalFetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById('app')).render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
