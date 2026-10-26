import { getWindowBounds } from '../../lib/layoutAlgo.js';
import { isPointInRect, screenToCanvas } from '../../lib/canvasMath.js';

/**
 * True when `el` is the board backdrop (or the region-menu backdrop that
 * stands in for it). Prefer hasAttribute over truthy `.dataset` — bare
 * data-* attrs can serialize as "" (falsy) outside React's "true" default.
 */
export function isCanvasSelectionSurface(el) {
  if (!el || typeof el.hasAttribute !== 'function') return false;
  return el.hasAttribute('data-canvas-bg') || el.hasAttribute('data-canvas-context-surface');
}

/** True when a pointer event landed on the board backdrop (not a window). */
export function isCanvasBackground(el, root) {
  return el === root || (el != null && typeof el.hasAttribute === 'function' && el.hasAttribute('data-canvas-bg'));
}

/**
 * If a context-menu event should delete the multi-selection, return those
 * ids; otherwise null. Single-window close stays on the window chrome.
 */
export function resolveMultiSelectContextDelete({
  target,
  selectedIds = [],
  wins = [],
  pan = { x: 0, y: 0 },
  zoom = 1,
  canvasRect,
  clientX,
  clientY,
}) {
  if (!isCanvasSelectionSurface(target) || selectedIds.length < 2 || !canvasRect) return null;
  const selectedBounds = getWindowBounds(wins.filter((win) => selectedIds.includes(win.id)));
  if (!selectedBounds) return null;
  const point = screenToCanvas(clientX, clientY, pan.x, pan.y, zoom, canvasRect);
  if (!isPointInRect(point.x, point.y, selectedBounds.x, selectedBounds.y, selectedBounds.w, selectedBounds.h)) {
    return null;
  }
  return selectedIds;
}
