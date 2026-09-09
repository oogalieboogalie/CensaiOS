import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync } from 'fs';

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
    },
  },
});
