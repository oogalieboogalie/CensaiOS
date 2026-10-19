// An agent pointing a person at a window (project_window point / run_app):
// the server stamps `pointedAt` on the window. Everyone on the board sees it
// glow for a few seconds; only the person who was chatting has their view
// slide over to it, so teammates are never yanked around the board.

export const POINT_GLOW_MS = 6000;

let signedInUserId = null;

/** Remember who is signed in on this tab (set from the presence hook). */
export function noteSignedInUser(id) {
  signedInUserId = id != null && id !== '' ? String(id) : null;
}

export function currentSignedInUser() {
  return signedInUserId;
}

/** 'true' while a fresh point should glow, else undefined (for a data attribute). */
export function pointedNow(win, now = Date.now()) {
  const at = Number(win?.pointedAt?.at);
  return Number.isFinite(at) && now - at >= 0 && now - at < POINT_GLOW_MS ? 'true' : undefined;
}

/** Windows that were just pointed at for this person and not glided to yet. */
export function freshPointsFor(wins, me, seen, now = Date.now()) {
  return (wins || []).filter((win) => {
    const point = win?.pointedAt;
    if (!pointedNow(win, now) || seen.has(`${win.id}@${point.at}`)) return false;
    return !point.forUserId || (me != null && String(point.forUserId) === String(me));
  });
}

/** Whether a background start belongs to this tab (Run dev opened by an agent). */
export function autoStartIsMine(win, me = signedInUserId) {
  return !win?.autoStartFor || (me != null && String(win.autoStartFor) === String(me));
}
