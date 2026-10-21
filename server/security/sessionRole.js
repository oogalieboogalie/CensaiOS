import pool from '../db.js';
import { createLogger } from '../logger.js';

// req.session.userRole is a copy of users.role taken at sign-in. Several
// places read that copy (server keys, chat, AI resources, key sharing, the
// command capabilities, the runtime-mode header), so a role changed in the
// database used to count only after a sign-out. This refreshes the copy from
// the database once per request, so promotion and demotion take effect on
// the very next request.
const log = createLogger('session-role');

export function createSessionRoleRefresh({ db = pool } = {}) {
  return async function refreshSessionRole(req, _res, next) {
    const userId = Number(req.session?.userId);
    if (!Number.isInteger(userId) || userId <= 0) return next();
    try {
      const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
      const role = rows[0]?.role ?? null;
      if (role && role !== req.session.userRole) {
        log.info('session role refreshed from the database', { userId, role });
        req.session.userRole = role;
      }
    } catch (error) {
      // Keep the sign-in copy rather than failing the request.
      log.warn('session role refresh skipped', { userId, code: error?.code || 'unknown' });
    }
    return next();
  };
}
