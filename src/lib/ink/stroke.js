// Pressure-aware ink (spec 9). Pure geometry: pointer samples in, stroke
// records and SVG outlines out. Strokes are stored in canvas units so they
// scale with the board like real ink; perfect-freehand turns the samples into
// a filled outline that tapers and thickens with pen pressure.
import { getStroke } from 'perfect-freehand';

// Tilting a pencil on its side lays down a broader line. Browsers report tilt
// as tiltX/tiltY in degrees (0 = upright); 60 degrees or more counts as flat.
const FULL_TILT_DEG = 60;
const TILT_WIDEN = 0.5;
const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;
// Toolbar pen sizes (2/4/8 px) to ink diameter at medium pressure.
export const INK_SCALE = 1.5;

/** Ink diameter in canvas units for a toolbar pen size at this zoom. */
export function inkSize(penSize, zoom = 1) {
  return round((penSize * INK_SCALE) / (zoom || 1), 3);
}

export function tiltAmount(event) {
  const tx = Number(event?.tiltX) || 0;
  const ty = Number(event?.tiltY) || 0;
  return Math.min(1, Math.hypot(tx, ty) / FULL_TILT_DEG);
}

/** One stored sample: canvas position, pressure (pen only) and tilt. */
export function inkPoint(canvasPt, event) {
  const isPen = event?.pointerType === 'pen';
  const pressure = isPen && event.pressure > 0 ? event.pressure : 0.5;
  const point = { x: round(canvasPt.x, 2), y: round(canvasPt.y, 2), p: round(pressure, 3) };
  const tilt = isPen ? tiltAmount(event) : 0;
  if (tilt > 0.05) point.t = round(tilt, 2);
  return point;
}

/**
 * The browser batches pen samples between frames; getCoalescedEvents hands
 * all of them back so fast strokes stay smooth instead of turning into lines.
 */
export function coalescedSamples(event) {
  try {
    const list = event?.getCoalescedEvents?.();
    if (list && list.length) return list;
  } catch { /* some browsers throw for synthetic events */ }
  return [event];
}

// Settings tuned to feel like a fine felt pen: noticeable taper, no wobble.
export function freehandOptions(stroke, { last = true } = {}) {
  return {
    size: stroke.size || 4,
    thinning: stroke.sim ? 0.5 : 0.62,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: Boolean(stroke.sim),
    start: { taper: stroke.sim ? 0 : Math.max(4, stroke.size * 1.5), cap: true },
    end: { taper: stroke.sim ? 0 : Math.max(4, stroke.size * 1.5), cap: true },
    last,
  };
}

function samplesFor(stroke) {
  return (stroke.pts || []).map((pt) => {
    const pressure = Math.min(1, (pt.p ?? 0.5) * (1 + TILT_WIDEN * (pt.t || 0)));
    return [pt.x, pt.y, pressure];
  });
}

export function inkOutline(stroke, options) {
  if (!stroke?.pts?.length) return [];
  return getStroke(samplesFor(stroke), freehandOptions(stroke, options));
}

/** Closed SVG path through the outline polygon, smoothed with quadratics. */
export function outlineToSvgPath(outline) {
  const len = outline.length;
  if (len < 4) return '';
  const avg = (a, b) => round((a + b) / 2, 2);
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let d = `M${round(a[0], 2)},${round(a[1], 2)} Q${round(b[0], 2)},${round(b[1], 2)} ${avg(b[0], c[0])},${avg(b[1], c[1])} T`;
  for (let i = 2; i < len - 1; i += 1) {
    a = outline[i];
    b = outline[i + 1];
    d += `${avg(a[0], b[0])},${avg(a[1], b[1])} `;
  }
  return `${d}Z`;
}

export function inkPath(stroke, options) {
  return outlineToSvgPath(inkOutline(stroke, options));
}

// Rendering re-runs on every sync; outlines only change when a stroke does.
const cache = new Map();
const MAX_CACHE = 4000;

export function cachedInkPath(stroke) {
  const pts = stroke.pts || [];
  const first = pts[0] || {};
  const last = pts[pts.length - 1] || {};
  const key = `${pts.length}:${stroke.size}:${stroke.sim ? 1 : 0}:${first.x},${first.y}:${last.x},${last.y}`;
  const hit = cache.get(stroke.id);
  if (hit && hit.key === key) return hit.d;
  const d = inkPath(stroke);
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(stroke.id, { key, d });
  return d;
}

/**
 * Commit the live samples as a stroke. `size` is the pen size in screen
 * pixels; dividing by zoom stores it in canvas units, so the ink looks the
 * same as it did while drawing and scales with the board afterwards.
 */
export function buildInkStroke(points, { color, size, zoom = 1, simulated = false, by = null }) {
  if (!points || points.length < 2) {
    if (points?.length !== 1) return null;
    points = [points[0], { ...points[0], x: points[0].x + 0.01 }];
  }
  const stroke = {
    id: crypto.randomUUID(),
    ink: 1,
    pts: points,
    color,
    size: inkSize(size, zoom),
  };
  if (simulated) stroke.sim = true;
  if (by) stroke.by = by;
  return stroke;
}

export function isInkStroke(stroke) {
  return stroke?.ink === 1;
}

export function strokeBounds(strokes) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const stroke of strokes || []) {
    const pad = (stroke.size || 3) / 2;
    for (const pt of stroke.pts || []) {
      minX = Math.min(minX, pt.x - pad); minY = Math.min(minY, pt.y - pad);
      maxX = Math.max(maxX, pt.x + pad); maxY = Math.max(maxY, pt.y + pad);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function translateStroke(stroke, dx, dy) {
  return { ...stroke, pts: stroke.pts.map((pt) => ({ ...pt, x: round(pt.x + dx, 2), y: round(pt.y + dy, 2) })) };
}
