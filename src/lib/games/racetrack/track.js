// Draw a track, drive a car. Pure geometry: a pen stroke goes in, a closed
// road comes out, and the car asks it where it is. No DOM, so Jest covers it.
//
// The road lives in its own WORLD units: the drawing is scaled so its longest
// side is WORLD_SPAN, whatever size it was on the canvas, and every screen
// scales that world to fit its window. The road is as wide as the pen line
// was thick (thin pen, narrow road), within limits a car can drive.

export const WORLD_SPAN = 1000;
export const MIN_WIDTH = 54;
export const MAX_WIDTH = 130;
const SPACING = 10; // world units between centre-line points
const MIN_LENGTH = 900; // a lap shorter than this is not much of a track
const MAX_GAP = 0.35; // an open end this far from the start (of the drawing's size) is not a loop
const MAX_POINTS = 600;

const round1 = (n) => Math.round(n * 10) / 10;

function readPoints(raw) {
  const out = [];
  for (const pt of Array.isArray(raw) ? raw : []) {
    const x = Number(Array.isArray(pt) ? pt[0] : pt?.x);
    const y = Number(Array.isArray(pt) ? pt[1] : pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.x === x && prev.y === y) continue;
    out.push({ x, y });
  }
  return out;
}

function boundsOf(pts) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * A hand-drawn loop rarely ends exactly on its start: it stops short or runs
 * past it. Cut the end back to the point nearest the start (looking only at
 * the last third, so the start's own neighbours don't count).
 */
function trimToStart(pts) {
  const from = Math.floor(pts.length * 0.66);
  let best = pts.length - 1;
  let bestD = Infinity;
  for (let i = from; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { pts: pts.slice(0, best + 1), gap: bestD };
}

/** Even spacing around a closed loop (the last point joins the first). */
function resampleLoop(pts, spacing) {
  const loop = [...pts, pts[0]];
  const out = [{ ...pts[0] }];
  let carry = 0;
  for (let i = 1; i < loop.length; i += 1) {
    const a = loop[i - 1];
    const b = loop[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let at = spacing - carry;
    while (at <= seg) {
      const t = at / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      at += spacing;
    }
    carry = seg - (at - spacing);
  }
  // The last sample can sit right on top of the first.
  const last = out[out.length - 1];
  if (out.length > 2 && Math.hypot(last.x - out[0].x, last.y - out[0].y) < spacing * 0.5) out.pop();
  return out;
}

/** Iron out the hand's wobble: a few passes of neighbour averaging. */
function smoothLoop(pts, passes = 3) {
  let cur = pts;
  for (let k = 0; k < passes; k += 1) {
    const n = cur.length;
    cur = cur.map((p, i) => {
      const a = cur[(i - 1 + n) % n];
      const b = cur[(i + 1) % n];
      return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
    });
  }
  return cur;
}

/** Road width in world units for a pen stroke of this thickness (canvas units). */
export function roadWidthFor(strokeSize) {
  const size = Number(strokeSize);
  const w = 42 + (Number.isFinite(size) && size > 0 ? size : 4) * 6;
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
}

/**
 * Turn drawn points into the track record a window keeps: centre-line points
 * in world units, the road width and the world's size. Returns
 * `{ track }` or `{ error }` with a sentence for the person who drew it.
 */
export function trackFromPoints(rawPoints, { strokeSize = 4 } = {}) {
  const pts = readPoints(rawPoints);
  if (pts.length < 8) return { error: 'Draw a bigger loop: this line is too short to drive on.' };
  const box = boundsOf(pts);
  const size = Math.max(box.w, box.h);
  if (!(size > 0)) return { error: 'Draw a loop, not a dot.' };
  const { pts: trimmed, gap } = trimToStart(pts);
  if (gap > Math.hypot(box.w, box.h) * MAX_GAP) return { error: 'Close the loop: end the line near where you started.' };
  if (trimmed.length < 8) return { error: 'Draw a bigger loop: this line is too short to drive on.' };

  const width = roadWidthFor(strokeSize);
  const margin = width;
  const scale = (WORLD_SPAN - margin * 2) / size;
  const scaled = trimmed.map((p) => ({ x: (p.x - box.x) * scale + margin, y: (p.y - box.y) * scale + margin }));
  let loop = smoothLoop(resampleLoop(scaled, SPACING));
  if (loop.length > MAX_POINTS) loop = smoothLoop(resampleLoop(loop, SPACING * (loop.length / MAX_POINTS)), 1);
  const track = {
    pts: loop.map((p) => [round1(p.x), round1(p.y)]),
    width,
    world: { w: Math.ceil(box.w * scale + margin * 2), h: Math.ceil(box.h * scale + margin * 2) },
  };
  const built = buildTrack(track);
  if (!built) return { error: 'Draw a bigger loop: this line is too short to drive on.' };
  if (built.length < MIN_LENGTH) return { error: 'Draw a bigger loop: this one is too tight to drive around.' };
  return { track };
}

/** A pen stroke from the board (spec 9 path record) as a track. */
export function trackFromStroke(stroke) {
  return trackFromPoints(stroke?.pts, { strokeSize: stroke?.size });
}

/** Of several strokes, the one most worth driving: the longest that makes a loop. */
export function pickTrackStroke(strokes) {
  let best = null;
  for (const stroke of Array.isArray(strokes) ? strokes : []) {
    const result = trackFromStroke(stroke);
    if (!result.track) continue;
    // Every track is scaled to the same world, so compare the drawings themselves.
    const pts = readPoints(stroke.pts);
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (!best || length > best.length) best = { stroke, track: result.track, length };
  }
  return best;
}

/**
 * Read a stored track record into what driving needs: points, cumulative
 * distance along the loop, its length and the start line. Returns null for
 * anything that isn't a usable track (a teammate's record can be anything).
 */
export function buildTrack(record) {
  const pts = readPoints(record?.pts);
  if (pts.length < 8) return null;
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(record?.width) || MIN_WIDTH));
  const n = pts.length;
  const cum = new Array(n + 1);
  cum[0] = 0;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const length = cum[n];
  if (!(length > 0)) return null;
  const box = boundsOf(pts);
  const world = {
    w: Math.max(Number(record?.world?.w) || 0, box.x + box.w + width),
    h: Math.max(Number(record?.world?.h) || 0, box.y + box.h + width),
  };
  const ahead = pts[1];
  const start = { x: pts[0].x, y: pts[0].y, angle: Math.atan2(ahead.y - pts[0].y, ahead.x - pts[0].x) };
  return { pts, cum, length, width, half: width / 2, world, start };
}

/**
 * Where a point is relative to the road: distance from the centre line,
 * distance travelled along the loop from the start line (0..length) and the
 * road's heading there.
 */
export function locate(track, x, y) {
  const { pts, cum } = track;
  const n = pts.length;
  let best = { dist: Infinity, s: 0, angle: 0, index: 0 };
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best.dist) best = { dist: d, s: cum[i] + (cum[i + 1] - cum[i]) * t, angle: Math.atan2(dy, dx), index: i };
  }
  return best;
}

/** A point at distance `s` along the loop, with the road's heading there. */
export function pointAt(track, s) {
  const { pts, cum, length } = track;
  const n = pts.length;
  const d = ((s % length) + length) % length;
  let i = 0;
  while (i < n - 1 && cum[i + 1] < d) i += 1;
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const t = (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** Where a car lines up: just behind the start line, facing the way the line was drawn. */
export function gridSpot(track, back = 36) {
  return pointAt(track, track.length - back);
}

// A rounded oval with a kink, for a window opened without a drawing.
export const SAMPLE_POINTS = (() => {
  const out = [];
  for (let i = 0; i < 72; i += 1) {
    const t = (i / 72) * Math.PI * 2;
    const r = 1 + 0.18 * Math.sin(t * 3);
    out.push([Math.round(500 + Math.cos(t) * 420 * r), Math.round(320 + Math.sin(t) * 230 * r)]);
  }
  return out;
})();

export function sampleTrack() {
  return trackFromPoints(SAMPLE_POINTS, { strokeSize: 8 }).track;
}
