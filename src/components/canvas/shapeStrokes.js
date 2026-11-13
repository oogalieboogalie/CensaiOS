// Straight shapes for the board, stored as the same point lists the rectangle
// already uses, so they draw, select and erase with the ink that is there.
import { newId } from '../../lib/ids/newId.js';
import { buildRectStroke } from './pointerBuilders.js';

const MIN = 8;

function tooSmall(length, zoom) {
  return length <= MIN / (zoom || 1);
}

export function buildLineStroke(x0, y0, x1, y1, zoom, penColor, penSize) {
  if (tooSmall(Math.hypot(x1 - x0, y1 - y0), zoom)) return null;
  return {
    id: newId(),
    pts: [{ x: x0, y: y0, p: 1 }, { x: x1, y: y1, p: 1 }],
    color: penColor,
    size: penSize,
  };
}

export function buildEllipseStroke(band, zoom, penColor, penSize) {
  if (!band || band.w <= MIN / zoom || band.h <= MIN / zoom) return null;
  const cx = band.x + band.w / 2;
  const cy = band.y + band.h / 2;
  const rx = band.w / 2;
  const ry = band.h / 2;
  const steps = 40;
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a), p: 1 });
  }
  return { id: newId(), pts, color: penColor, size: penSize };
}

export function buildArrowStroke(x0, y0, x1, y1, zoom, penColor, penSize) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (tooSmall(len, zoom)) return null;
  const ux = dx / len;
  const uy = dy / len;
  const head = Math.min(len * 0.35, Math.max(14 / (zoom || 1), len * 0.2));
  const wing = head * 0.55;
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  const px = -uy * wing;
  const py = ux * wing;
  return {
    id: newId(),
    pts: [
      { x: x0, y: y0, p: 1 },
      { x: x1, y: y1, p: 1 },
      { x: bx + px, y: by + py, p: 1 },
      { x: x1, y: y1, p: 1 },
      { x: bx - px, y: by - py, p: 1 },
      { x: x1, y: y1, p: 1 },
    ],
    color: penColor,
    size: penSize,
  };
}

export function isShapeMode(mode) {
  return mode === 'rect' || mode === 'ellipse' || mode === 'line' || mode === 'arrow';
}

export function commitShape({ mode, band, from, zoom, penColor, penSize }) {
  if (mode === 'rect') return buildRectStroke(band, zoom, penColor, penSize);
  if (mode === 'ellipse') return buildEllipseStroke(band, zoom, penColor, penSize);
  if ((mode === 'line' || mode === 'arrow') && from && from.x1 != null) {
    const build = mode === 'line' ? buildLineStroke : buildArrowStroke;
    return build(from.x0, from.y0, from.x1, from.y1, zoom, penColor, penSize);
  }
  return null;
}
