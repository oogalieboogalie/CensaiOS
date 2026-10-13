// server/lessons/cursorTap.js
//
// The classroom grid draws each student's cursor on their board's tile.
// The instructor isn't connected to every student board, so the
// collaboration socket notes the last cursor per board here and the grid
// reads it with the rest of the roster. In memory only; a cursor older
// than a few seconds is treated as gone.

const STALE_MS = 15_000;
const MAX_BOARDS = 2_000;
const boards = new Map();

export function noteCursor(workspaceId, actor, x, y, now = Date.now()) {
  if (!actor?.classStudent) return;
  if (boards.size > MAX_BOARDS) boards.clear();
  let bucket = boards.get(String(workspaceId));
  if (!bucket) {
    bucket = new Map();
    boards.set(String(workspaceId), bucket);
  }
  bucket.set(String(actor.id), { x, y, at: now, label: actor.label, color: actor.color || null });
}

export function cursorsFor(workspaceId, now = Date.now()) {
  const bucket = boards.get(String(workspaceId));
  if (!bucket) return [];
  const live = [];
  for (const [id, cursor] of bucket) {
    if (now - cursor.at > STALE_MS) bucket.delete(id);
    else live.push({ id, ...cursor });
  }
  return live;
}

export function __resetCursorTapForTests() {
  boards.clear();
}
