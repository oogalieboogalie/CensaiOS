// Excalidraw (MIT, https://github.com/excalidraw/excalidraw), loaded only when
// a Diagrams window opens so the canvas itself stays small. Its hand-drawn
// fonts are served by censaiOS (vite.config.js copies them to
// /vendor/excalidraw/); only the large Chinese font still comes from esm.sh,
// and only if someone types Chinese.
import '@excalidraw/excalidraw/index.css';

if (typeof window !== 'undefined' && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = '/vendor/excalidraw/';
}

export * from '@excalidraw/excalidraw';
