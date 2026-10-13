import { isPointInRect } from '../../lib/canvasMath.js';

const REGION_NEIGHBOR_SNAP = 30;

export function getSvgPathFromStroke(pts) {
  if (!pts || pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i += 1) d += ` L ${pts[i].x} ${pts[i].y}`;
  return d;
}

export function hasCanvasUiAncestor(target, stopAt) {
  let node = target;
  while (node && node !== stopAt) {
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute?.('data-canvas-ui')) return true;
    node = node.parentNode;
  }
  return false;
}

export function findRegionNeighbor(rect, wins) {
  let best = null;
  for (const win of wins.filter(w => !w.pinned)) {
    const verticalOverlap = overlapAmount(rect.y, rect.y + rect.h, win.y, win.y + win.h);
    const horizontalOverlap = overlapAmount(rect.x, rect.x + rect.w, win.x, win.x + win.w);
    const candidates = buildNeighborCandidates(rect, win, verticalOverlap, horizontalOverlap);
    for (const candidate of candidates) {
      if (candidate.gap > REGION_NEIGHBOR_SNAP || candidate.overlap <= 0) continue;
      if (!best || candidate.gap < best.gap) best = { ...candidate, win };
    }
  }
  return best;
}

export function basenameFromPath(filePath = '') {
  const parts = String(filePath).split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] || 'workspace';
}

export function windowInsideGroup(win, group) {
  const center = { x: win.x + win.w / 2, y: win.y + win.h / 2 };
  return isPointInRect(center.x, center.y, group.x, group.y, group.w, group.h);
}

export function windowsInSelection(wins, rect) {
  return wins.filter((win) => {
    if (win.pinned) return false;
    const centerX = win.x + win.w / 2;
    const centerY = win.y + win.h / 2;
    return isPointInRect(centerX, centerY, rect.x, rect.y, rect.w, rect.h);
  }).map((win) => win.id);
}

function overlapAmount(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function buildNeighborCandidates(rect, win, verticalOverlap, horizontalOverlap) {
  return [
    { side: 'left', gap: Math.abs((rect.x + rect.w) - win.x), overlap: verticalOverlap, fitted: { x: win.x - win.w, y: win.y, w: win.w, h: win.h } },
    { side: 'right', gap: Math.abs(rect.x - (win.x + win.w)), overlap: verticalOverlap, fitted: { x: win.x + win.w, y: win.y, w: win.w, h: win.h } },
    { side: 'top', gap: Math.abs((rect.y + rect.h) - win.y), overlap: horizontalOverlap, fitted: { x: win.x, y: win.y - win.h, w: win.w, h: win.h } },
    { side: 'bottom', gap: Math.abs(rect.y - (win.y + win.h)), overlap: horizontalOverlap, fitted: { x: win.x, y: win.y + win.h, w: win.w, h: win.h } },
  ];
}
