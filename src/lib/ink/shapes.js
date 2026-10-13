// "Clean up shapes" (spec 9): a rough line, box or circle becomes a clean
// one. Pure geometry, deliberately conservative: a stroke that doesn't
// clearly read as a shape is left alone.

function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

function bounds(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Mean distance from each point to the nearest edge of the box, relative to its size.
function rectError(pts, b) {
  const scale = Math.max(1, Math.min(b.w, b.h));
  const sum = pts.reduce((acc, p) => acc + Math.min(
    Math.abs(p.x - b.x), Math.abs(p.x - (b.x + b.w)), Math.abs(p.y - b.y), Math.abs(p.y - (b.y + b.h)),
  ), 0);
  return sum / pts.length / scale;
}

// Mean radial error against the box's inscribed ellipse, relative to 1.
function ellipseError(pts, b) {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
  const rx = Math.max(1, b.w / 2); const ry = Math.max(1, b.h / 2);
  const sum = pts.reduce((acc, p) => acc + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0);
  return sum / pts.length;
}

function linePoints(a, b, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }));
}

export function rectPoints(b) {
  const corners = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }, { x: b.x, y: b.y }];
  return corners.slice(1).flatMap((c, i) => linePoints(corners[i], c, 8).slice(i === 0 ? 0 : 1));
}

export function ellipsePoints(b, steps = 64) {
  const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: cx + (b.w / 2) * Math.cos(a), y: cy + (b.h / 2) * Math.sin(a) };
  });
}

/**
 * Recognize a stroke's points as a shape.
 * Returns { kind: 'line'|'rect'|'ellipse', bounds, from?, to? } or null.
 */
export function recognizeShape(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const length = pathLength(pts);
  if (length < 12) return null;
  const first = pts[0]; const last = pts[pts.length - 1];
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  if (chord / length > 0.94) return { kind: 'line', from: { x: first.x, y: first.y }, to: { x: last.x, y: last.y } };

  const b = bounds(pts);
  const closed = chord < Math.max(16, 0.22 * Math.max(b.w, b.h));
  if (!closed || b.w < 10 || b.h < 10) return null;
  const rect = rectError(pts, b);
  const ellipse = ellipseError(pts, b);
  if (rect < 0.06 && rect * 1.6 < ellipse) return { kind: 'rect', bounds: b };
  if (ellipse < 0.14) return { kind: 'ellipse', bounds: b };
  if (rect < 0.08) return { kind: 'rect', bounds: b };
  return null;
}

/** A canvas ink stroke redrawn as its clean shape (even pressure), or null. */
export function cleanUpStroke(stroke) {
  const shape = recognizeShape(stroke?.pts);
  if (!shape) return null;
  let pts;
  if (shape.kind === 'line') pts = linePoints(shape.from, shape.to);
  else if (shape.kind === 'rect') pts = rectPoints(shape.bounds);
  else pts = ellipsePoints(shape.bounds);
  const round = (n) => Math.round(n * 100) / 100;
  const { sim: _sim, ...rest } = stroke;
  return { ...rest, ink: 1, shape: shape.kind, pts: pts.map((p) => ({ x: round(p.x), y: round(p.y), p: 0.5 })) };
}

/** Even-odd point in polygon. */
export function pointInPolygon(pt, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** Strokes with most of their points inside the lasso loop. */
export function strokesInLasso(strokes, loop, share = 0.7) {
  if (!Array.isArray(loop) || loop.length < 3) return [];
  return (strokes || []).filter((s) => {
    const pts = s.pts || [];
    if (!pts.length) return false;
    const inside = pts.filter((p) => pointInPolygon(p, loop)).length;
    return inside / pts.length >= share;
  }).map((s) => s.id);
}

/** Strokes whose every point lies inside the box. */
export function strokesInBox(strokes, box) {
  if (!box) return [];
  return (strokes || []).filter((s) => s.pts?.length && s.pts.every((p) => (
    p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
  ))).map((s) => s.id);
}
