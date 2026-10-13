// ─── Zoom constants ───
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.08;

// ─── helpers: screen ↔ canvas coordinate conversion ───
export function screenToCanvas(screenX, screenY, panX, panY, zoom, canvasRect) {
  return {
    x: (screenX - canvasRect.left - panX) / zoom,
    y: (screenY - canvasRect.top - panY) / zoom,
  };
}

// ─── geometry helpers ───
export function isPointInRect(px, py, rx, ry, rw, rh) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function boundsForItems(items = []) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.w);
    maxY = Math.max(maxY, item.y + item.h);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// ─── clustering ───
export function clusterWindows(wins = []) {
  const items = wins.filter(w =>
    Number.isFinite(w.x) && Number.isFinite(w.y) &&
    Number.isFinite(w.w) && Number.isFinite(w.h)
  );
  const visited = new Set();
  const clusters = [];
  const maxGap = 240;

  const closeEnough = (a, b) => {
    const ax2 = a.x + a.w;
    const ay2 = a.y + a.h;
    const bx2 = b.x + b.w;
    const by2 = b.y + b.h;
    const gapX = Math.max(0, Math.max(b.x - ax2, a.x - bx2));
    const gapY = Math.max(0, Math.max(b.y - ay2, a.y - by2));
    return Math.hypot(gapX, gapY) <= maxGap;
  };

  for (const item of items) {
    if (visited.has(item.id)) continue;
    const cluster = [];
    const queue = [item];
    visited.add(item.id);
    while (queue.length) {
      const current = queue.shift();
      cluster.push(current);
      for (const candidate of items) {
        if (visited.has(candidate.id)) continue;
        if (!closeEnough(current, candidate)) continue;
        visited.add(candidate.id);
        queue.push(candidate);
      }
    }
    clusters.push(cluster);
  }

  return clusters;
}

// ─── view fitting ───
export function computeFitBounds(bounds) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const padding = 120;
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(1, (W - padding * 2) / Math.max(1, bounds.w), (H - padding * 2) / Math.max(1, bounds.h))
  );
  const cx = bounds.minX + bounds.w / 2;
  const cy = bounds.minY + bounds.h / 2;
  return {
    x: W / 2 - cx * zoom,
    y: H / 2 - cy * zoom,
    zoom,
  };
}

export function computeFitView(wins = [], groups = []) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const items = [...wins, ...groups].filter(i =>
    Number.isFinite(i.x) && Number.isFinite(i.y) &&
    Number.isFinite(i.w) && Number.isFinite(i.h)
  );

  if (items.length === 0) {
    return { x: W / 2, y: H / 2, zoom: 1 };
  }

  const bounds = boundsForItems(items);
  const padding = 100;

  const fitZoom = Math.min(1, (W - padding * 2) / Math.max(1, bounds.w), (H - padding * 2) / Math.max(1, bounds.h));
  const zoom = Math.max(MIN_ZOOM, fitZoom);

  const cx = bounds.minX + bounds.w / 2;
  const cy = bounds.minY + bounds.h / 2;
  return { x: W / 2 - cx * zoom, y: H / 2 - cy * zoom, zoom };
}

// ─── zoom pan helper ───
export function getPanAfterZoom(panX, panY, cx, cy, oldZoom, newZoom) {
  const ratio = newZoom / oldZoom;
  return {
    panX: cx - ratio * (cx - panX),
    panY: cy - ratio * (cy - panY)
  };
}

import { getAgentById } from './agentStore.js';

export function getAccentBorder(win) {
  if (win.hue !== undefined) return `oklch(0.62 0.14 ${win.hue})`;
  const firstAttached = (win.attachedAgents || [])[0];
  if (firstAttached) { const a = getAgentById(firstAttached); if (a) return `oklch(0.62 0.14 ${a.hue})`; }
  if (win.agentId) { const a = getAgentById(win.agentId); if (a) return `oklch(0.62 0.14 ${a.hue})`; }
  return 'oklch(var(--accent-l) calc(var(--accent-c) * 0.6) var(--accent-h))';
}
