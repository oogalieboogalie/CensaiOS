// Where a new window opens. It used to land in the middle of the view with a
// little random jitter, so opening six modules piled six windows on top of
// each other. Now it takes the nearest empty spot inside what the person can
// see, keeping a gap to every window and group so the snap seams stay clean.
// When the view is full it takes the nearest spot just past the edge and the
// board glides over to it; when even that is full (or the window is bigger
// than the screen) it falls back to a tidy diagonal step from the centre.

import { BASE_UNIT } from './layout/constants.js';

// Room kept clear between the new window and its neighbours, in canvas px.
export const FREE_SPOT_GAP = BASE_UNIT;
// Fallback step when nothing fits, in canvas px.
export const CASCADE_STEP = BASE_UNIT * 2;
// Screen edges a window should not open under (top bar, footer, sides).
export const VIEW_MARGIN = Object.freeze({ top: 64, right: 24, bottom: 48, left: 24 });

const finite = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

/** Visible board area in canvas coordinates, minus the screen margins. */
export function visibleCanvasRect({ pan = { x: 0, y: 0 }, zoom = 1, width, height }, margin = VIEW_MARGIN) {
  const z = zoom > 0 ? zoom : 1;
  const left = (margin.left - pan.x) / z;
  const top = (margin.top - pan.y) / z;
  const right = (width - margin.right - pan.x) / z;
  const bottom = (height - margin.bottom - pan.y) / z;
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

/** Everything on the board a new window should not cover. */
export function boardObstacles(wins = [], groups = []) {
  const rects = [];
  for (const w of wins) {
    // Pinned and maximized windows float above the board in screen space.
    if (!w || w.pinned || w.maximized) continue;
    const r = { x: w.x, y: w.y, w: w.w ?? w.width, h: w.h ?? w.height };
    if (finite(r)) rects.push(r);
  }
  for (const g of groups) if (finite(g)) rects.push({ x: g.x, y: g.y, w: g.w, h: g.h });
  return rects;
}

function overlaps(a, b, gap) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function centredIn(view, size) {
  return { x: view.x + (view.w - size.w) / 2, y: view.y + (view.h - size.h) / 2 };
}

// Candidate edges along one axis: the view's own edges and centre, plus a
// spot flush against each side of every obstacle (one gap away).
function axisCandidates(start, length, span, rects, pos, len, gap) {
  const out = new Set([start, start + length - span, start + (length - span) / 2]);
  for (const r of rects) {
    out.add(r[pos] + r[len] + gap);
    out.add(r[pos] - gap - span);
    out.add(r[pos]);
    out.add(r[pos] + r[len] - span);
  }
  return [...out].filter(v => v >= start - 0.5 && v + span <= start + length + 0.5);
}

/**
 * Nearest empty spot for a window of `size` inside `view` (canvas coords),
 * or null when nothing fits. "Nearest" means closest to the view centre.
 */
export function nearestFreeSpot(size, view, obstacles = [], gap = FREE_SPOT_GAP) {
  if (!finite(view) || size.w > view.w || size.h > view.h) return null;
  const near = obstacles.filter(r => overlaps(r, view, gap));
  const xs = axisCandidates(view.x, view.w, size.w, near, 'x', 'w', gap);
  const ys = axisCandidates(view.y, view.h, size.h, near, 'y', 'h', gap);
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  let best = null;
  let bestDist = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const d = Math.hypot(x + size.w / 2 - cx, y + size.h / 2 - cy);
      if (d >= bestDist) continue;
      const rect = { x, y, w: size.w, h: size.h };
      if (near.some(r => overlaps(rect, r, gap))) continue;
      best = { x: Math.round(x), y: Math.round(y) };
      bestDist = d;
    }
  }
  return best;
}

/**
 * Tidy fallback: start at the view centre and step down-right until the
 * top-left corner is not already taken, so stacked windows stay readable.
 */
export function cascadeSpot(size, view, wins = [], step = CASCADE_STEP) {
  const base = centredIn(view, size);
  const taken = (p) => wins.some(w => w && Math.abs(w.x - p.x) < step / 2 && Math.abs(w.y - p.y) < step / 2);
  for (let i = 0; i < 12; i += 1) {
    const p = { x: Math.round(base.x + i * step), y: Math.round(base.y + i * step) };
    if (!taken(p)) return p;
  }
  return { x: Math.round(base.x), y: Math.round(base.y) };
}

function inflate(r, dx, dy) {
  return { x: r.x - dx, y: r.y - dy, w: r.w + dx * 2, h: r.h + dy * 2 };
}

/** Smallest pan change that brings `rect` fully into view, or null if it already is. */
export function panToShow(rect, { pan = { x: 0, y: 0 }, zoom = 1, width, height }, margin = VIEW_MARGIN) {
  const view = visibleCanvasRect({ pan, zoom, width, height }, margin);
  const shift = (start, len, vStart, vLen) => {
    if (start < vStart) return vStart - start;
    if (start + len > vStart + vLen) return Math.max(vStart - start, vStart + vLen - start - len);
    return 0;
  };
  const dx = shift(rect.x, rect.w, view.x, view.w);
  const dy = shift(rect.y, rect.h, view.y, view.h);
  if (!dx && !dy) return null;
  return { x: Math.round(pan.x + dx * zoom), y: Math.round(pan.y + dy * zoom) };
}

/**
 * Where a new window of `size` opens on this board, given the current view.
 * Returns { x, y, pan }: `pan` is set when the spot sits just past the edge of
 * the view and the board should glide over to show it, otherwise null.
 */
export function findFreeSpot(size, { wins = [], groups = [], pan = { x: 0, y: 0 }, zoom = 1, width, height } = {}) {
  const screen = {
    pan, zoom,
    width: width ?? (typeof window !== 'undefined' ? window.innerWidth : 1280),
    height: height ?? (typeof window !== 'undefined' ? window.innerHeight : 800),
  };
  const view = visibleCanvasRect(screen);
  const obstacles = boardObstacles(wins, groups);
  const inView = nearestFreeSpot(size, view, obstacles);
  if (inView) return { ...inView, pan: null };
  // Nothing free on screen: look just past the edges, then a little further,
  // and glide the view over to the spot.
  const rings = [
    inflate(view, size.w + FREE_SPOT_GAP, size.h + FREE_SPOT_GAP),
    inflate(view, Math.max(size.w, view.w) + FREE_SPOT_GAP, Math.max(size.h, view.h) + FREE_SPOT_GAP),
  ];
  if (size.w <= view.w && size.h <= view.h) {
    for (const area of rings) {
      const spot = nearestFreeSpot(size, area, obstacles);
      if (spot) return { ...spot, pan: panToShow({ ...spot, ...size }, screen) };
    }
  }
  return { ...cascadeSpot(size, view, wins), pan: null };
}
