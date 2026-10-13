// Gently slide the board's pan to a new spot. Used when a new window opens
// just past the edge of the screen, so the person sees where it went.
// People who ask their system for less motion get an instant jump.

const DURATION_MS = 320;
let frame = null;

const ease = (t) => 1 - (1 - t) ** 3;

function prefersStill() {
  try {
    return typeof window === 'undefined' || !window.requestAnimationFrame
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * Animate pan from `from` to `to`, calling `apply(pan)` each frame. With a
 * `read` getter the glide stops as soon as someone else moves the board
 * (the person grabbed it mid-glide).
 */
export function glidePan(from, to, apply, { read = null, duration = DURATION_MS } = {}) {
  if (frame) cancelAnimationFrame(frame);
  frame = null;
  if (prefersStill() || !from) { apply(to); return; }
  const start = performance.now();
  let last = from;
  const tick = (now) => {
    const cur = read?.();
    if (cur && (cur.x !== last.x || cur.y !== last.y)) { frame = null; return; }
    const t = Math.min(1, (now - start) / duration);
    const k = ease(t);
    last = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    apply(last);
    frame = t < 1 ? requestAnimationFrame(tick) : null;
  };
  frame = requestAnimationFrame(tick);
}
