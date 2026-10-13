/**
 * src/lib/desktopTitleBar.js
 *
 * In the desktop app (Tauri), paint the native window title bar the same
 * colour as the board so the frame reads as one surface. The Rust side
 * (src-tauri/src/title_bar.rs) sets the Windows caption colour through DWM.
 * In a plain browser this does nothing.
 */

function tauriInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

let probe = null;

/** Any CSS colour the browser understands (oklch, color-mix…) → '#rrggbb'. */
export function cssColorToHex(color) {
  if (typeof document === 'undefined' || !color) return null;
  probe = probe || document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

let last = '';

/** Read the board's background and ink and hand them to the native frame. */
export function syncDesktopTitleBar() {
  const invoke = tauriInvoke();
  if (!invoke || typeof document === 'undefined') return;
  const styles = getComputedStyle(document.body);
  const background = cssColorToHex(styles.backgroundColor);
  const text = cssColorToHex(styles.color);
  if (!background || !text) return;
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const key = `${background}|${text}|${dark}`;
  if (key === last) return;
  last = key;
  Promise.resolve(invoke('set_title_bar_color', { background, text, dark })).catch(() => { last = ''; });
}
