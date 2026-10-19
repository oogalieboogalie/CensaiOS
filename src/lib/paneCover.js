import { trimForGrips } from './paneGrips.js';

// Desktop Browser page vs. whatever sits on top of it.
//
// The page is a native view that always paints above the canvas, so it cannot
// slide under another window the way a normal window does. It used to hide
// completely as soon as any one of five test points was covered, so Censai's
// round button over a corner blacked out the whole page.
//
// Now the page shrinks back from a covering window, Censai's chat, a toast or
// a menu, as long as at least MIN_SHOWN_SHARE of it stays on screen. Only when
// something covers more than that does the page hide, and `hiddenBy` says what
// covers it so the window can tell the person how to get it back.

export const MIN_SHOWN_SHARE = 0.5;
const ROUNDS = 6;

function area(r) {
  return r ? Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top) : 0;
}

function intersect(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right - left < 2 || bottom - top < 2) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// A 3 x 3 grid kept clear of the window frame's rounded corners, so a window
// laid over the middle of an edge is seen too, not only the four corners.
export function probePoints(r) {
  const inset = Math.min(16, r.width / 4, r.height / 4);
  const xs = [r.left + inset, r.left + r.width / 2, r.right - inset];
  const ys = [r.top + inset, r.top + r.height / 2, r.bottom - inset];
  return ys.flatMap((y) => xs.map((x) => [x, y]));
}

function cssPosition(node) {
  try { return getComputedStyle(node).position; } catch { return ''; }
}

// What owns a point on top of the page: another canvas window ('window'),
// something pinned to the screen such as Censai's chat or a toast ('pinned'),
// or anything else ('other': the page hides, as before).
export function coverAt(hit, el, positionOf = cssPosition) {
  const frame = hit.closest?.('[data-win-frame]');
  if (frame && !frame.contains(el)) return { kind: 'window', node: frame };
  for (let node = hit; node && node.getBoundingClientRect; node = node.parentElement) {
    if (node.contains?.(el)) break;
    if (positionOf(node) === 'fixed') return { kind: 'pinned', node };
  }
  return { kind: 'other', node: hit };
}

// Windows and pinned panels (Censai's chat, toasts) are found by their own
// boxes, so even one smaller than the gap between probe points is seen. The
// probe grid still catches anything unmarked, such as a menu.
const COVER_SELECTOR = '[data-win-frame], [data-pane-cover]';
const ON_TOP_SAMPLES = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

// Every marked window or panel that overlaps `probe` and is actually on top
// of the page somewhere in that overlap (one lying underneath is skipped).
export function coversOver(el, probe, doc) {
  const out = [];
  for (const node of doc.querySelectorAll?.(COVER_SELECTOR) || []) {
    if (node.contains(el) || el.contains(node)) continue;
    const over = intersect(node.getBoundingClientRect(), probe);
    if (!over) continue;
    const onTop = ON_TOP_SAMPLES.some(([fx, fy]) => {
      const hit = doc.elementFromPoint(over.left + over.width * fx, over.top + over.height * fy);
      return Boolean(hit) && node.contains(hit);
    });
    if (onTop) out.push({ node, kind: node.hasAttribute?.('data-win-frame') ? 'window' : 'pinned' });
  }
  return out;
}

// The native page is one rectangle, so it cannot have a notch cut out for a
// corner. Cut it back from each cover on whichever side loses the least page.
export function trimAround(rect, covers) {
  let cur = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  for (const c of covers) {
    if (!(c.left < cur.right && c.right > cur.left && c.top < cur.bottom && c.bottom > cur.top)) continue;
    const w = cur.right - cur.left;
    const h = cur.bottom - cur.top;
    const options = [
      ['bottom', (cur.bottom - c.top) * w],
      ['right', (cur.right - c.left) * h],
      ['left', (c.right - cur.left) * h],
      ['top', (c.bottom - cur.top) * w],
    ];
    let best = options[0];
    for (const option of options) if (option[1] < best[1]) best = option;
    if (best[0] === 'bottom') cur.bottom = Math.max(cur.top, c.top);
    if (best[0] === 'right') cur.right = Math.max(cur.left, c.left);
    if (best[0] === 'left') cur.left = Math.min(cur.right, c.right);
    if (best[0] === 'top') cur.top = Math.min(cur.bottom, c.bottom);
  }
  return { ...cur, width: cur.right - cur.left, height: cur.bottom - cur.top };
}

const kindOf = (covers) => {
  const kinds = [...covers.values()].map((c) => c.kind);
  return kinds.includes('window') ? 'window' : kinds[0];
};

/**
 * Where the native page may show this frame.
 * @returns {{ clear: boolean, rect?: object, trimmedBy?: string, hiddenBy?: string }}
 *   rect: the box to give the page (resize grips and covers cut away).
 *   trimmedBy / hiddenBy: 'window' | 'pinned' | 'other' | 'offscreen'.
 */
export function fitPane(el, rect, { clip = false, grips = [], doc = document, positionOf = cssPosition } = {}) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (rect.width < 2 || rect.height < 2) return { clear: false, hiddenBy: 'offscreen' };
  const offScreen = rect.left < 0 || rect.top < 0 || rect.right > vw || rect.bottom > vh;
  if (offScreen && !clip) return { clear: false, hiddenBy: 'offscreen' };
  const visible = intersect(rect, { left: 0, top: 0, right: vw, bottom: vh });
  if (!visible) return { clear: false, hiddenBy: 'offscreen' };

  const covers = new Map();
  const add = (node, kind) => {
    if (covers.has(node)) return false;
    covers.set(node, { kind, rect: node.getBoundingClientRect() });
    return true;
  };
  const base = trimForGrips(rect, grips);
  for (let round = 0; round < ROUNDS; round += 1) {
    const shown = trimAround(base, [...covers.values()].map((c) => c.rect));
    const probe = intersect(shown, visible);
    if (!probe || area(probe) < area(visible) * MIN_SHOWN_SHARE) return { clear: false, hiddenBy: kindOf(covers) || 'other' };
    let added = false;
    for (const cover of coversOver(el, probe, doc)) added = add(cover.node, cover.kind) || added;
    if (added) continue;
    for (const [x, y] of probePoints(probe)) {
      const hit = doc.elementFromPoint(x, y);
      if (!hit) return { clear: false, hiddenBy: 'other' };
      if (el.contains(hit) || hit.closest?.('[data-pane-passthrough]')) continue;
      const cover = coverAt(hit, el, positionOf);
      if (cover.kind === 'other') return { clear: false, hiddenBy: 'other' };
      added = add(cover.node, cover.kind) || added;
    }
    if (!added) {
      const trimmedBy = kindOf(covers);
      return { clear: true, rect: shown, ...(trimmedBy ? { trimmedBy } : {}) };
    }
  }
  return { clear: false, hiddenBy: kindOf(covers) || 'other' };
}

// What the window says in the page's place while it is hidden. Clicking a
// window raises it, so a page under another window comes back on a click.
export function hiddenMessage(hiddenBy) {
  if (hiddenBy === 'window') return 'Another window is on top of this page. Click here to bring it to the front.';
  if (hiddenBy === 'pinned') return 'Something pinned to the screen covers most of this page. Move this window a little to see it.';
  return 'The page is hidden while something covers this window.';
}

// One line for the app log when the page shrinks or hides, so a "my page went
// dark" report can be traced.
export function coverLogLine(fit) {
  if (fit.clear && fit.trimmedBy === 'window') return 'browser page: shrunk to stay out from under another window';
  if (fit.clear && fit.trimmedBy === 'pinned') return 'browser page: shrunk to stay out from under something pinned to the screen';
  if (fit.clear) return '';
  if (fit.hiddenBy === 'window') return 'browser page: hidden, another window covers most of it (click it to bring it to the front)';
  if (fit.hiddenBy === 'pinned') return 'browser page: hidden, something pinned to the screen covers most of it';
  if (fit.hiddenBy === 'other') return 'browser page: hidden, a menu or panel covers it';
  return '';
}
