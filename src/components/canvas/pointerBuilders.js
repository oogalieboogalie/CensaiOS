// Pure pointer-geometry and stroke builders extracted from useCanvasPointer.
// No React, no refs, no DOM — independently unit-testable. The hook owns all
// state and event wiring; these functions only compute values from arguments.
import { getPanAfterZoom, MAX_ZOOM, MIN_ZOOM } from '../../lib/canvasMath.js';
import { newId } from '../../lib/ids/newId.js';

export function shouldStartCanvasPan(button, keyboardHeld, panMode = 'both') {
  return (['both', 'middle'].includes(panMode) && button === 1)
    || (button === 0 && keyboardHeld);
}

export function buildBandBox(drag, canvasPt) {
  return {
    x: Math.min(drag.x0, canvasPt.x),
    y: Math.min(drag.y0, canvasPt.y),
    w: Math.abs(canvasPt.x - drag.x0),
    h: Math.abs(canvasPt.y - drag.y0),
    mode: drag.mode,
    isGroup: drag.mode === 'group',
    isSelection: drag.mode === 'selection',
  };
}

export function buildFreehandStroke(currentPath, penColor, penSize) {
  if (!currentPath || currentPath.length <= 1) return null;
  const avgPressure = currentPath.reduce((sum, pt) => sum + (pt.p || 1), 0) / currentPath.length;
  return {
    id: newId(),
    pts: currentPath,
    color: penColor,
    size: penSize * Math.max(0.35, avgPressure),
  };
}

export function buildRectStroke(band, zoom, penColor, penSize) {  if (!band || band.w <= 8 / zoom || band.h <= 8 / zoom) return null;
  const pts = [
    { x: band.x, y: band.y, p: 1 },
    { x: band.x + band.w, y: band.y, p: 1 },
    { x: band.x + band.w, y: band.y + band.h, p: 1 },
    { x: band.x, y: band.y + band.h, p: 1 },
    { x: band.x, y: band.y, p: 1 },
  ];
  return { id: newId(), pts, color: penColor, size: penSize };
}

export function computePinchZoom(first, second, rect, start) {
  const centerX = ((first.x + second.x) / 2) - rect.left;
  const centerY = ((first.y + second.y) / 2) - rect.top;
  const distanceNow = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, start.startZoom * (distanceNow / start.startDistance)));
  const nextPan = getPanAfterZoom(
    start.startPanX,
    start.startPanY,
    centerX,
    centerY,
    start.startZoom,
    newZoom,
  );
  return { ...nextPan, zoom: newZoom };
}

export function consumeSuppression(suppressRef) {
  const suppressed = suppressRef.current;
  suppressRef.current = false;
  return suppressed;
}

// Blur a focused input/textarea/contenteditable so a canvas click or pan start
// takes keyboard focus away from the editor the user just left.
export function blurActiveEditable(doc = document) {
  const el = doc.activeElement;
  if (!el || typeof el.blur !== 'function') return;
  if (['INPUT', 'TEXTAREA'].includes(el.tagName) || el.contentEditable === 'true') el.blur();
}

// A press on the empty board also takes the focus and the text selection out
// of the windows. The canvas cancels that press, so the browser would leave
// both where they were, and a window keeps its keys and pastes while either
// stays inside it (src/lib/pasteOwner.js).
export function leaveWindows(doc = document) {
  const el = doc.activeElement;
  if (el && typeof el.blur === 'function' && el.closest?.('[data-win-id]')) el.blur();
  const selection = doc.getSelection?.();
  const anchor = selection?.anchorNode;
  const anchorEl = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
  if (selection?.rangeCount && anchorEl?.closest?.('[data-win-id]')) selection.removeAllRanges();
}

const INTERACTIVE_PAN_BLOCKERS = 'button, a, input, textarea, select, [contenteditable="true"], [data-canvas-ui], [data-canvas-context-surface]';

// Never hijack clicks on interactive canvas UI (launchpad tiles, region menu,
// inputs): turning a button press into a pan drag via preventDefault + pointer
// capture silently kills onClick with no errors.
export function isInteractivePanTarget(target) {
  return !!target?.closest?.(INTERACTIVE_PAN_BLOCKERS);
}

// Snapshot taken when a second finger lands; computePinchZoom reads it on move.
export function buildPinchStart(first, second, zoom, pan) {
  return {
    startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    startZoom: zoom,
    startPanX: pan.x,
    startPanY: pan.y,
  };
}
