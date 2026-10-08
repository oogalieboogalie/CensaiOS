// Live ink (spec 9): while someone draws, their stroke streams to everyone
// on the board as an ephemeral `ink.preview` message, so you watch the line
// grow like a cursor moves. The finished stroke then lands through the
// shared Yjs doc and the preview is dropped. Shared by browser and server.

export const MAX_LIVE_POINTS = 300;
export const LIVE_INK_INTERVAL_MS = 40;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const COLOR_PATTERN = /^[#a-zA-Z0-9(),.%*\s-]{1,96}$/;
const MAX_COORDINATE = 1_000_000;

const r1 = (n) => Math.round(n * 10) / 10;

/** Even sample of at most `max` points, always keeping the last one. */
export function decimate(points, max = MAX_LIVE_POINTS) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

/** Wire payload for a stroke in progress. */
export function encodeLiveInk({ strokeId, points, color, size, sim = false, phase = 'move' }) {
  return {
    strokeId,
    phase: phase === 'end' ? 'end' : 'move',
    color: String(color || ''),
    size,
    sim: Boolean(sim),
    pts: decimate(points).map((pt) => [r1(pt.x), r1(pt.y), Math.round((pt.p ?? 0.5) * 100) / 100]),
  };
}

/** Validate an incoming preview; returns the clean message or null. */
export function normalizeInkPreview(message) {
  if (!ID_PATTERN.test(String(message?.strokeId || ''))) return null;
  const pts = message?.pts;
  if (!Array.isArray(pts) || pts.length === 0 || pts.length > MAX_LIVE_POINTS) return null;
  const clean = [];
  for (const pt of pts) {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const [x, y, p = 0.5] = pt;
    if (![x, y, p].every(Number.isFinite) || Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
    clean.push([x, y, Math.min(1, Math.max(0, p))]);
  }
  const size = Number(message.size);
  if (!Number.isFinite(size) || size <= 0 || size > 500) return null;
  const color = message.color && COLOR_PATTERN.test(String(message.color)) ? String(message.color) : '';
  return { strokeId: message.strokeId, phase: message.phase === 'end' ? 'end' : 'move', color, size, sim: Boolean(message.sim), pts: clean };
}

/** A received preview as a renderable ink stroke. */
export function liveInkStroke(message) {
  return {
    id: `live-${message.strokeId}`,
    ink: 1,
    color: message.color || undefined,
    size: message.size,
    sim: message.sim || undefined,
    pts: message.pts.map(([x, y, p]) => ({ x, y, p })),
  };
}

/** Throttles sends to one per interval, but always sends the end. */
export function createLiveInkSender(send, { interval = LIVE_INK_INTERVAL_MS, now = () => Date.now() } = {}) {
  let last = -Infinity;
  return (payload) => {
    const t = now();
    if (payload.phase !== 'end' && t - last < interval) return false;
    last = t;
    send(encodeLiveInk(payload));
    return true;
  };
}
