// server/routes/shareLinkHttp.js
//
// Small pieces the guest-link routers share: error replies, the signed-in
// check, member display names and the "links changed" nudge.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { memberRolesFor } from '../access/policy.js';

export const log = createLogger('share-links');
// Which workspace roles pass, straight from the one policy (server/access/policy.js).
export const MANAGE_ROLES = memberRolesFor('links.manage');
export const COMMENT_ROLES = memberRolesFor('comment.write');
export const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export function sendError(res, error) {
  const status = error.statusCode || 500;
  if (status >= 500) log.warn('share link request failed', { code: safeErrorCode(error) });
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Try again.' : error.message,
    ...(error.code ? { code: error.code } : {}),
  });
}

export function requireUser(req, res) {
  if (req.session?.userId) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export async function memberActor(db, userId) {
  const { rows } = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
  const user = rows[0] || {};
  const name = user.name || String(user.email || '').split('@')[0] || `Member ${userId}`;
  return { kind: 'user', id: String(userId), name: name.slice(0, 64), color: null };
}

export function publishLinkState(workspaceId) {
  publishWorkspaceEvent(workspaceId, { type: 'share.links.changed' });
}
