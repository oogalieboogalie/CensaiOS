// Live state of the window being dragged: where the pointer is (canvas
// units), the guide lines from edge snapping, and the dock target the
// overlay resolved. Kept outside React state so a drag re-renders only the
// overlay that draws it, never the window tree (PR #119 perf contract).
import React from 'react';

let state = null;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

export const dragState = {
  get: () => state,
  /** Merge a partial update into the current drag. */
  update(patch) {
    state = { ...(state || {}), ...patch };
    emit();
  },
  clear() {
    if (state === null) return;
    state = null;
    emit();
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useDragState() {
  return React.useSyncExternalStore(dragState.subscribe, dragState.get, dragState.get);
}
