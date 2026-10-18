import React from 'react';
import { isAdBlockEnabled } from './adBlock.js';
import { gripRects, trimForGrips } from './paneGrips.js';

// Desktop (Tauri) only: drives a native child webview layered over a Browser
// window's content area (see src-tauri/src/browser_pane.rs). Real sites refuse
// to load inside an <iframe>, so the desktop build never uses one for browsing.
// The desktop app also blocks ads in these panes and reports a per-pane count.

export function tauriInvoke() {
  if (typeof window === 'undefined') return null;
  return window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke || null;
}

export function hasNativeBrowserPane() {
  return Boolean(tauriInvoke());
}

export function paneId(winId) {
  return String(winId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// The native view always paints above the DOM, so it is hidden whenever its
// area is collapsed or covered by another canvas window or menu.
//
// Small canvas chrome that only shows on hover (a group's resize corner, the
// seams between tiles) is marked `data-pane-passthrough`: it does not count as
// covering, or moving the mouse into a group blanks a Browser tile.
//
// `clip`: the view is a child of the app window, so the operating system cuts
// off whatever hangs past the app's edges. Then a window dragged partly off
// screen keeps showing its page and only the part still on screen is probed.
// Without it (a real app window docked over the canvas, which is not cut off)
// any part off screen hides it.
export function isAreaClear(el, rect, { clip = false } = {}) {
  if (rect.width < 2 || rect.height < 2) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const offScreen = rect.left < 0 || rect.top < 0 || rect.right > vw || rect.bottom > vh;
  if (offScreen && !clip) return false;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(vw, rect.right);
  const bottom = Math.min(vh, rect.bottom);
  const width = right - left;
  const height = bottom - top;
  if (width < 2 || height < 2) return false;
  // Stay clear of the window frame's rounded corners when probing.
  const inset = Math.min(16, width / 4, height / 4);
  const points = [
    [left + width / 2, top + height / 2],
    [left + inset, top + inset],
    [right - inset, top + inset],
    [left + inset, bottom - inset],
    [right - inset, bottom - inset],
  ];
  return points.every(([x, y]) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit) return false;
    return el.contains(hit) || Boolean(hit.closest?.('[data-pane-passthrough]'));
  });
}

// How much the canvas has shrunk or grown this area: its size on screen over
// its own layout size. The native page cannot see the canvas's CSS transform,
// so it is zoomed by this much to match the rest of the board.
export function paneScale(el, rect) {
  const own = el?.offsetWidth || 0;
  if (own < 1 || !(rect?.width > 0)) return 1;
  return Math.round((rect.width / own) * 100) / 100;
}

// Below this canvas zoom a window may show its icon instead of the page
// (an opt-in window setting; off by default).
export const ICON_COVER_BELOW = 0.5;

export function useNativeBrowserPane({ winId, areaRef, url, onNavigated, coverWhenSmall = false }) {
  const enabled = hasNativeBrowserPane();
  const id = paneId(winId);
  const [visible, setVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [blocked, setBlocked] = React.useState(0);
  const [covered, setCovered] = React.useState(false);
  const coverRef = React.useRef(coverWhenSmall);
  coverRef.current = coverWhenSmall;
  const openedRef = React.useRef(false);
  const urlRef = React.useRef(url);
  const onNavigatedRef = React.useRef(onNavigated);
  const zoomResetRef = React.useRef(() => {});
  urlRef.current = url;
  onNavigatedRef.current = onNavigated;

  // Keep the native view glued to the content area every frame; only talk to
  // Rust when something actually changed.
  React.useEffect(() => {
    if (!enabled) return undefined;
    const invoke = tauriInvoke();
    let frame = 0;
    let lastKey = '';
    let lastVisible = null;
    let lastZoom = null;
    let lastCovered = false;
    let opening = false;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = areaRef.current;
      if (!el || !urlRef.current) return;
      const area = el.getBoundingClientRect();
      const scale = paneScale(el, area);
      const cover = Boolean(coverRef.current) && scale < ICON_COVER_BELOW;
      if (cover !== lastCovered) { lastCovered = cover; setCovered(cover); }
      const clear = !cover && isAreaClear(el, area, { clip: true });
      // Leave resize corners and edges over the page grabbable.
      const r = trimForGrips(area, gripRects());
      const box = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };

      if (!openedRef.current) {
        if (!clear || opening) return;
        opening = true;
        invoke('browser_pane_open', { id, url: urlRef.current, ...box, adblock: isAdBlockEnabled() })
          .then(() => { openedRef.current = true; lastKey = JSON.stringify(box); lastVisible = true; lastZoom = null; setVisible(true); })
          .catch((err) => console.error('[browser-pane] open failed', err))
          .finally(() => { opening = false; });
        return;
      }

      if (clear !== lastVisible) {
        lastVisible = clear;
        setVisible(clear);
        invoke('browser_pane_set_visible', { id, visible: clear }).catch(() => {});
      }
      const key = JSON.stringify(box);
      if (clear && key !== lastKey) {
        lastKey = key;
        invoke('browser_pane_set_bounds', { id, ...box }).catch(() => {});
      }
      // Some pages reset the zoom when they load, so a navigation clears lastZoom.
      if (clear && scale !== lastZoom) {
        lastZoom = scale;
        invoke('browser_pane_set_zoom', { id, zoom: scale }).catch(() => {});
      }
    };
    zoomResetRef.current = () => { lastZoom = null; };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      openedRef.current = false;
      invoke('browser_pane_close', { id }).catch(() => {});
    };
  }, [enabled, id, areaRef]);

  React.useEffect(() => {
    const listen = typeof window !== 'undefined' ? window.__TAURI__?.event?.listen : null;
    if (!enabled || !listen) return undefined;
    const unlisteners = [];
    let cancelled = false;
    const on = (name, handler) => listen(name, (event) => {
      const payload = event?.payload || {};
      if (payload.id === id) handler(payload);
    }).then((fn) => {
      if (cancelled) fn(); else unlisteners.push(fn);
    });
    on('browser-pane://navigated', (payload) => {
      setLoading(Boolean(payload.loading));
      zoomResetRef.current();
      onNavigatedRef.current?.(payload.url, Boolean(payload.loading));
    });
    on('browser-pane://blocked', (payload) => setBlocked(Number(payload.count) || 0));
    return () => { cancelled = true; unlisteners.forEach((fn) => fn()); };
  }, [enabled, id]);

  const call = React.useCallback((cmd, args = {}) => {
    const invoke = tauriInvoke();
    if (!invoke || !openedRef.current) return Promise.resolve();
    return invoke(cmd, { id, ...args }).catch((err) => console.error(`[browser-pane] ${cmd} failed`, err));
  }, [id]);

  return {
    enabled,
    visible,
    loading,
    // True while the window shows its icon because the board is zoomed far out.
    covered,
    // Ads and trackers blocked on the current page (desktop app on Windows).
    blocked,
    // Before the pane exists, the frame loop opens it at urlRef.current.
    navigate: (next) => (openedRef.current ? call('browser_pane_navigate', { url: next }) : Promise.resolve()),
    back: () => call('browser_pane_back'),
    forward: () => call('browser_pane_forward'),
    reload: () => call('browser_pane_reload'),
  };
}
