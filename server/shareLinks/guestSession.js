// server/shareLinks/guestSession.js
//
// A guest has no account: their express session carries `guest` (which
// link they came through, their name and color) and no `userId`, so every
// existing account-only route keeps refusing them. Each guest request and
// socket re-reads the link, so a revoked or expired link stops working at
// once rather than when the session cookie ages out.

import { capabilitiesForRole } from './access.js';
import { getShareLinkById, linkIsActive } from './store.js';

function denied(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function guestActor(guest, link) {
  // A class student on their own seat (spec 12) may lead the camera there,
  // so the instructor can follow them; on the instructor's board they watch.
  const classStudent = Boolean(guest.enrollmentId && String(link?.id) === String(guest.linkId));
  return Object.freeze({
    type: 'guest',
    id: String(guest.guestId),
    label: String(guest.name || 'Guest').slice(0, 64),
    color: guest.color || null,
    role: link?.role || guest.role || 'view',
    spectator: link?.mode === 'live',
    ...(classStudent ? { classStudent: true, classId: String(guest.classId) } : {}),
  });
}

/** Resolve the guest on a session, or throw 401 (no guest) / 410 (link gone). */
export async function resolveGuestSession(db, session, { workspaceId = null } = {}) {
  const guest = session?.guest;
  if (!guest?.linkId || !guest?.guestId) throw denied('Join with a share link first.', 401, 'GUEST_SESSION_REQUIRED');
  // A class pass also opens the instructor's board through the class link.
  const classLinks = guest.classLinks || {};
  const linkId = (workspaceId && Object.hasOwn(classLinks, workspaceId) && classLinks[workspaceId]) || guest.linkId;
  const link = await getShareLinkById(db, linkId);
  if (!linkIsActive(link)) throw denied('This share link was turned off or has expired.', 410, 'SHARE_LINK_INACTIVE');
  if (workspaceId && String(link.workspace_id) !== String(workspaceId)) {
    throw denied('This share link is for a different board.', 403, 'SHARE_LINK_WRONG_WORKSPACE');
  }
  if (guest.enrollmentId) {
    const { rows } = await db.query('SELECT status FROM lesson_enrollments WHERE id::text = $1', [String(guest.enrollmentId)]);
    if (rows[0]?.status !== 'active') throw denied('Your class membership has ended.', 410, 'LESSON_SEAT_INACTIVE');
  }
  return {
    guest,
    link,
    capabilities: capabilitiesForRole(link.role),
    actor: guestActor(guest, link),
    workspace: { id: link.workspace_id, name: link.workspace_name, role: link.role === 'edit' ? 'member' : 'viewer' },
  };
}
