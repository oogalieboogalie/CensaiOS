// Geometry for Censai Vector shapes. Every shape is plain data:
//
//   rect     { x, y, w, h, rx }
//   ellipse  { x, y, w, h }                 the box the ellipse fills
//   line     { x1, y1, x2, y2 }
//   path     { subpaths: [{ pts: [{ x, y, ix, iy, ox, oy }], closed }] }
//            each point carries its incoming (ix, iy) and outgoing (ox, oy)
//            bezier handle; a corner has both handles on the point itself
//   text     { x, y, text, size, weight }    x, y is the top-left corner
//
// plus style: fill, stroke, sw (stroke width), opacity, group, at.

const r2 = (n) => Math.round(n * 100) / 100;

export function corner(x, y) {
  return { x, y, ix: x, iy: y, ox: x, oy: y };
}

/** SVG path data for a path shape. */
export function pathD(shape) {
  const out = [];
  for (const sp of shape.subpaths || []) {
    const pts = sp.pts || [];
    if (!pts.length) continue;
    out.push(`M${r2(pts[0].x)} ${r2(pts[0].y)}`);
    const seg = (a, b) => {
      const straight = a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y;
      out.push(straight ? `L${r2(b.x)} ${r2(b.y)}` : `C${r2(a.ox)} ${r2(a.oy)} ${r2(b.ix)} ${r2(b.iy)} ${r2(b.x)} ${r2(b.y)}`);
    };
    for (let i = 1; i < pts.length; i += 1) seg(pts[i - 1], pts[i]);
    if (sp.closed && pts.length > 1) { seg(pts[pts.length - 1], pts[0]); out.push('Z'); }
  }
  return out.join(' ');
}

function cubicAt(a, b, c, d, t) {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Every point a path passes through, sampled finely enough for a bounding box. */
export function samplePath(shape, steps = 16) {
  const out = [];
  for (const sp of shape.subpaths || []) {
    const pts = sp.pts || [];
    const segs = pts.map((p, i) => [p, pts[i + 1]]).slice(0, -1);
    if (sp.closed && pts.length > 1) segs.push([pts[pts.length - 1], pts[0]]);
    if (pts.length === 1) out.push({ x: pts[0].x, y: pts[0].y });
    for (const [a, b] of segs) {
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        out.push({ x: cubicAt(a.x, a.ox, b.ix, b.x, t), y: cubicAt(a.y, a.oy, b.iy, b.y, t) });
      }
    }
  }
  return out;
}

export function textLines(shape) {
  return String(shape.text ?? '').split('\n');
}

/** The axis-aligned box a shape covers. Text width is an estimate. */
export function shapeBox(s) {
  if (s.type === 'rect' || s.type === 'ellipse') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.type === 'line') return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  if (s.type === 'text') {
    const size = s.size || 32;
    const lines = textLines(s);
    return { x: s.x, y: s.y, w: Math.max(...lines.map((l) => l.length)) * size * 0.56, h: lines.length * size * 1.2 };
  }
  const pts = samplePath(s);
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The box around several boxes. */
export function unionBox(boxes) {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Apply a point function to a shape's geometry. `scaleY` sizes text. */
function mapShape(s, f, scaleY = 1) {
  if (s.type === 'rect' || s.type === 'ellipse') {
    const [x1, y1] = f(s.x, s.y);
    const [x2, y2] = f(s.x + s.w, s.y + s.h);
    return { ...s, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  if (s.type === 'line') {
    const [x1, y1] = f(s.x1, s.y1);
    const [x2, y2] = f(s.x2, s.y2);
    return { ...s, x1, y1, x2, y2 };
  }
  if (s.type === 'text') {
    const [x, y] = f(s.x, s.y);
    return { ...s, x, y, size: Math.max(4, Math.round((s.size || 32) * Math.abs(scaleY) * 10) / 10) };
  }
  return {
    ...s,
    subpaths: (s.subpaths || []).map((sp) => ({
      ...sp,
      pts: sp.pts.map((p) => {
        const [x, y] = f(p.x, p.y);
        const [ix, iy] = f(p.ix, p.iy);
        const [ox, oy] = f(p.ox, p.oy);
        return { x, y, ix, iy, ox, oy };
      }),
    })),
  };
}

export function moveShape(s, dx, dy) {
  return mapShape(s, (x, y) => [x + dx, y + dy]);
}

/** Fit a shape that sat in box `from` into box `to` (resizing a selection). */
export function transformShape(s, from, to) {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return mapShape(s, (x, y) => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy], sy);
}

/** Apply a 2D matrix [a b c d e f] (as in SVG) to a path or line. */
export function matrixShape(s, m) {
  const [a, b, c, d, e, f] = m;
  const scale = Math.sqrt(Math.abs(a * d - b * c)) || 1;
  const out = mapShape(s, (x, y) => [a * x + c * y + e, b * x + d * y + f], scale);
  return s.sw ? { ...out, sw: Math.round(s.sw * scale * 100) / 100 } : out;
}

// Bezier circle constant: handles at 0.5523 of the radius.
const K = 0.5522847498;

/** Any shape except text as a path, so it can be edited point by point. */
export function toPath(s) {
  if (s.type === 'path') return s;
  const style = { fill: s.fill, stroke: s.stroke, sw: s.sw, opacity: s.opacity, group: s.group, at: s.at, name: s.name };
  if (s.type === 'line') return { ...style, type: 'path', subpaths: [{ pts: [corner(s.x1, s.y1), corner(s.x2, s.y2)], closed: false }] };
  if (s.type === 'ellipse' || (s.type === 'rect' && s.rx)) {
    if (s.type === 'ellipse') {
      const rx = s.w / 2; const ry = s.h / 2; const cx = s.x + rx; const cy = s.y + ry;
      const pts = [
        { x: cx + rx, y: cy, ix: cx + rx, iy: cy - ry * K, ox: cx + rx, oy: cy + ry * K },
        { x: cx, y: cy + ry, ix: cx + rx * K, iy: cy + ry, ox: cx - rx * K, oy: cy + ry },
        { x: cx - rx, y: cy, ix: cx - rx, iy: cy + ry * K, ox: cx - rx, oy: cy - ry * K },
        { x: cx, y: cy - ry, ix: cx - rx * K, iy: cy - ry, ox: cx + rx * K, oy: cy - ry },
      ];
      return { ...style, type: 'path', subpaths: [{ pts, closed: true }] };
    }
    const r = Math.min(s.rx, s.w / 2, s.h / 2);
    const { x, y, w, h } = s;
    const k = r * (1 - K);
    const pts = [
      { x: x + r, y, ix: x + k, iy: y, ox: x + r, oy: y }, { x: x + w - r, y, ix: x + w - r, iy: y, ox: x + w - k, oy: y },
      { x: x + w, y: y + r, ix: x + w, iy: y + k, ox: x + w, oy: y + r }, { x: x + w, y: y + h - r, ix: x + w, iy: y + h - r, ox: x + w, oy: y + h - k },
      { x: x + w - r, y: y + h, ix: x + w - k, iy: y + h, ox: x + w - r, oy: y + h }, { x: x + r, y: y + h, ix: x + r, iy: y + h, ox: x + k, oy: y + h },
      { x, y: y + h - r, ix: x, iy: y + h - k, ox: x, oy: y + h - r }, { x, y: y + r, ix: x, iy: y + r, ox: x, oy: y + k },
    ];
    return { ...style, type: 'path', subpaths: [{ pts, closed: true }] };
  }
  if (s.type === 'rect') {
    const pts = [corner(s.x, s.y), corner(s.x + s.w, s.y), corner(s.x + s.w, s.y + s.h), corner(s.x, s.y + s.h)];
    return { ...style, type: 'path', subpaths: [{ pts, closed: true }] };
  }
  return s;
}
