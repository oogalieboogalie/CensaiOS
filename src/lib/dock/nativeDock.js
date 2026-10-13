// Desktop (Tauri, Windows) only: keeps a real app window glued to a dock app
// window's slot (see src-tauri/src/app_dock.rs) and sends teammates small
// pictures of it. Every Tauri call goes through `invoke`, so tests pass a stub.
import React from 'react';
import { isAreaClear, tauriInvoke } from '../nativeBrowserPane.js';
import { CAST_EVERY_MS, CAST_TYPE, dockSlotId, slotBox, slotKey, slotUsable } from './wire.js';

export function hasNativeDock() {
  return Boolean(tauriInvoke());
}

export function listDockableWindows(invoke = tauriInvoke()) {
  if (!invoke) return Promise.reject(new Error('desktop only'));
  return invoke('dock_list_windows');
}

function errorText(error) {
  return String(error?.message || error || '');
}

/**
 * One frame of the glue loop, kept separate from React so tests can drive it.
 * `state` carries what was last sent; returns the call it made, if any.
 */
export function dockTick({ invoke, id, target, rect, clear, state }) {
  const box = slotBox(rect);
  const visible = slotUsable(box, clear);
  const key = slotKey(box, visible);
  if (state.busy || state.gone || state.failed) return null;
  if (state.attachedTo !== target) {
    state.busy = true;
    state.lastKey = key;
    state.visible = visible;
    return invoke('dock_attach', { id, target, ...box, visible })
      .then(() => { state.attachedTo = target; state.error = null; })
      .catch((error) => {
        state.error = errorText(error);
        if (state.error === 'gone') state.gone = true;
        else state.failed = true;
      })
      .finally(() => { state.busy = false; });
  }
  if (key === state.lastKey) return null;
  state.lastKey = key;
  state.visible = visible;
  state.busy = true;
  return invoke('dock_set_bounds', { id, ...box, visible })
    .catch((error) => {
      state.error = errorText(error);
      if (state.error === 'gone') state.gone = true;
    })
    .finally(() => { state.busy = false; });
}

/**
 * Keeps `target` (a native window handle from the picker) over `areaRef`.
 * Calls onGone when the app was closed. While `cast` is on, sends a picture
 * through `send` every CAST_EVERY_MS that the app is on screen.
 */
export function useNativeDock({ windowId, areaRef, target, cast, send, encode, onGone }) {
  const invoke = tauriInvoke();
  const enabled = Boolean(invoke && target);
  const id = dockSlotId(windowId);
  const [visible, setVisible] = React.useState(false);
  const [error, setError] = React.useState(null);
  const stateRef = React.useRef(null);
  const onGoneRef = React.useRef(onGone);
  onGoneRef.current = onGone;

  React.useEffect(() => {
    if (!enabled) return undefined;
    const state = { attachedTo: null, lastKey: '', visible: false, busy: false, gone: false, failed: false, error: null };
    stateRef.current = state;
    let frame = 0;
    let shownVisible = null;
    let shownError = null;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = areaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dockTick({ invoke, id, target, rect, clear: isAreaClear(el, rect), state });
      if (state.visible !== shownVisible) { shownVisible = state.visible; setVisible(state.visible); }
      if (state.error !== shownError) { shownError = state.error; setError(state.error); }
      if (state.gone) {
        cancelAnimationFrame(frame);
        onGoneRef.current?.();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stateRef.current = null;
      // Hands the app back where it was before it was docked.
      invoke('dock_detach', { id }).catch(() => {});
    };
  }, [enabled, invoke, id, target, areaRef]);

  React.useEffect(() => {
    if (!enabled || !cast || !send) return undefined;
    let stopped = false;
    let running = false;
    const timer = setInterval(() => {
      const state = stateRef.current;
      if (running || !state?.visible || state.attachedTo !== target) return;
      running = true;
      invoke('dock_capture', { id, maxWidth: 480 })
        .then((bytes) => {
          if (stopped) return;
          const picture = encode?.(bytes);
          if (picture) send({ type: CAST_TYPE, windowId: id, ...picture });
        })
        .catch(() => {})
        .finally(() => { running = false; });
    }, CAST_EVERY_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
      send({ type: CAST_TYPE, windowId: id, frame: null });
    };
  }, [enabled, cast, send, encode, invoke, id, target]);

  return { enabled, visible, error };
}
