import { canvasObjectToLegacyWindow } from './canvasObjectTypes.js';

export function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

export function withoutUnsupportedWindows(wins = []) {
  return (wins || [])
    .filter(w => w?.kind !== 'whiteboard' && w?.type !== 'whiteboard')
    .map(canvasObjectToLegacyWindow);
}

// Convert screen center to canvas coords so windows spawn in the visible viewport
export function randomDropSpot({ w, h }, pan = { x: 0, y: 0 }, zoom = 1) {
  const W = window.innerWidth, H = window.innerHeight;
  const jitter = 80;
  // Center of screen in canvas-space
  const cx = (W / 2 - pan.x) / zoom - w / 2;
  const cy = (H / 2 - pan.y) / zoom - h / 2;
  return {
    x: cx + (Math.random() - 0.5) * jitter * 2,
    y: cy + (Math.random() - 0.5) * jitter * 2,
  };
}

export const DEFAULT_HTML_PREVIEW = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Censai Preview</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Inter, system-ui, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        width: min(560px, calc(100vw - 48px));
        padding: 32px;
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        background: white;
        box-shadow: 0 16px 45px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { margin: 0; line-height: 1.55; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>HTML Preview</h1>
      <p>This preview window is live and ready for pasted or opened HTML.</p>
    </main>
  </body>
</html>`;

