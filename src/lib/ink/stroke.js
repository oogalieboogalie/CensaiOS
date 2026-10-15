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

/**
 * A light hand on a real pen (Surface, Wacom) reports 0.02-0.15, which used
 * to draw a hairline. Lift the light end so a gentle stroke still reads,
 * leave medium (0.5) and hard presses where they were.
 */
export function feltPressure(p) {
  const raw = Math.max(0, Math.min(1, Number(p) || 0));
  return raw >= 0.5 ? raw : 0.5 * Math.sqrt(raw * 2);
}

const THINNING = 0.5;

function strokeLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

// Settings tuned to feel like a fine felt pen: noticeable taper, no wobble.
// Short flicks and ticks get round ends instead of a taper (a taper on both
// ends of a short stroke used to leave nothing), and on longer strokes it
// never eats more than a quarter of the line from each end.
function taperFor(stroke) {
  const size = stroke.size || 4;
  const len = strokeLength(stroke.pts || []);
  if (stroke.sim || len < size * 4) return 0;
  return Math.min(Math.max(4, size * 1.5), len / 4);
}

export function freehandOptions(stroke, { last = true } = {}) {
  const taper = taperFor(stroke);
  return {
    size: stroke.size || 4,
    thinning: stroke.sim ? 0.5 : THINNING,
    smoothing: 0.55,
    streamline: 0.4,
    simulatePressure: Boolean(stroke.sim),
    start: { taper, cap: true },
    end: { taper, cap: true },
    last,
  };
}

function samplesFor(stroke) {
  return (stroke.pts || []).map((pt) => {
    const pressure = Math.min(1, feltPressure(pt.p ?? 0.5) * (1 + TILT_WIDEN * (pt.t || 0)));
    return [pt.x, pt.y, pressure];
  });
}

/**
 * A tap: a round dot at least the pen's normal width (a tap is short, so the
 * pen rarely reports much pressure), bigger if pressed harder.
 */
function dotOutline(stroke) {
  const pts = stroke.pts;
  const pressure = stroke.sim ? 0.5 : Math.max(0.5, ...samplesFor(stroke).map((s) => s[2]));
  const r = Math.max(0.5, ((stroke.size || 4) / 2) * (0.5 + THINNING * (pressure - 0.5)) * 2);
  const cx = pts.reduce((sum, pt) => sum + pt.x, 0) / pts.length;
  const cy = pts.reduce((sum, pt) => sum + pt.y, 0) / pts.length;
  return Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

export function inkOutline(stroke, options) {
  if (!stroke?.pts?.length) return [];
  // Anything shorter than the pen is wide is a dot, not a line.
  if (strokeLength(stroke.pts) < Math.max(1, (stroke.size || 4) / 2)) return dotOutline(stroke);
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
