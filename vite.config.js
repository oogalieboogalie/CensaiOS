import { defineConfig, createLogger } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync } from 'fs';

const baseLogger = createLogger();
// Backend restarts (node --watch) and cold boots make the proxy target
// briefly vanish. Those two codes mean exactly one thing in dev — "backend
// not there right now" — and the dev waiter already reports boot problems
// loudly. Downgrade them to debug so normal restarts don't bury real logs.
const TRANSIENT_PROXY_CODES = new Set(['ECONNREFUSED', 'ECONNRESET']);
const isTransientProxyNoise = (msg, opts) =>
  typeof msg === 'string'
  && (msg.includes('proxy error') || msg.includes('proxy socket error'))
  && !!opts && !!opts.error && TRANSIENT_PROXY_CODES.has(opts.error.code);
const customLogger = {
  ...baseLogger,
  error: (msg, opts) => {
    if (!isTransientProxyNoise(msg, opts)) baseLogger.error(msg, opts);
  },
  warn: (msg, opts) => {
    if (!isTransientProxyNoise(msg, opts)) baseLogger.warn(msg, opts);
  },
};

// Optional entries: landing.html is not part of the public source export.
const input = { main: resolve(__dirname, 'index.html') };
if (existsSync(resolve(__dirname, 'landing.html'))) {
  input.landing = resolve(__dirname, 'landing.html');
}
if (existsSync(resolve(__dirname, 'automation.html'))) {
  input.automation = resolve(__dirname, 'automation.html');
}
if (existsSync(resolve(__dirname, 'window-lab.html'))) {
  input.windowLab = resolve(__dirname, 'window-lab.html');
}

export default defineConfig({
  plugins: [react()],
  customLogger,
  define: {
    'process.env.IS_PREACT': JSON.stringify('true'),
    'process.env': {},
  },
  build: {
    rollupOptions: {
      input,
    },
  },
  server: {
    host: true,
    port: 5173,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
      // Yjs (CRDT) canvas sync, server/collab/hocuspocus.js.
      '/hocuspocus': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
});
