// Geometry for the board map (CanvasMinimap): one small picture of the whole
// board with every window, group, person and agent on it, plus the part of
// the board on screen right now. Pure functions so the math is testable.

export const MAP_MAX_W = 220;
export const MAP_MAX_H = 140;
const PAD = 160;

const finite = (r) => r && [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0;

/** The part of the board on screen, in board coordinates. */
export function viewportRect(pan, zoom, screen) {
  const z = zoom || 1;
  return { x: -pan.x / z, y: -pan.y / z, w: screen.w / z, h: screen.h / z };
}

/** Windows that sit on the board (not pinned to the screen, not maximized, not a hidden tab). */
export function mapWindows(wins = [], hiddenIds = new Set()) {
  return wins.filter((w) => finite(w) && !w.pinned && !w.maximized && !w.minimized && !hiddenIds.has(w.id));
}

/** One box around everything worth showing, the screen included, with a margin. */
export function worldBounds(rects = [], viewport = null) {
  const all = [...rects, viewport].filter(finite);
  if (!all.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of all) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 };
}

/** Map size and scale that fit the world inside the max map box, keeping its shape. */
export function mapLayout(world, maxW = MAP_MAX_W, maxH = MAP_MAX_H) {
  const scale = Math.min(maxW / world.w, maxH / world.h);
  return { scale, w: Math.max(40, Math.round(world.w * scale)), h: Math.max(30, Math.round(world.h * scale)) };
}

export function toMap(rect, world, scale) {
  return { x: (rect.x - world.x) * scale, y: (rect.y - world.y) * scale, w: rect.w * scale, h: rect.h * scale };
}

export function fromMap(px, py, world, scale) {
  return { x: world.x + px / scale, y: world.y + py / scale };
}

/** The pan that puts a board point in the middle of the screen. */
export function panToCenter(point, zoom, screen) {
  const z = zoom || 1;
  return { x: screen.w / 2 - point.x * z, y: screen.h / 2 - point.y * z };
}

/** The topmost map window under a board point, or null. */
export function windowAt(point, wins = []) {
  for (let i = wins.length - 1; i >= 0; i -= 1) {
    const w = wins[i];
    if (point.x >= w.x && point.x <= w.x + w.w && point.y >= w.y && point.y <= w.y + w.h) return w;
  }
  return null;
}
