import pool from '../db.js';

// What a teammate sees when they try something only the computer's owner may
// do (Docker, dev servers, git pushes, host files, tasks, the terminal).
export const OWNER_ONLY_MESSAGE = "Only this computer's owner can do this.";

export async function assertSystemAdmin(req, { db = pool } = {}) {
  const userId = Number(req?.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
  }
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  if (rows[0]?.role !== 'admin') {
    throw Object.assign(new Error(OWNER_ONLY_MESSAGE), { statusCode: 403 });
  }
  return { userId, role: 'admin' };
}

function refuse(res, error) {
  const status = error.statusCode || 500;
  return res.status(status).json({
    error: status === 500 ? 'System administrator verification is temporarily unavailable.' : error.message,
    ...(status === 403 ? { reason: 'owner-only', code: 'computer_owner_only' } : {}),
  });
}

/** Only the computer's owner (the first admin: the desktop app's own user). */
export async function requireSystemAdmin(req, res, next) {
  try {
    await assertSystemAdmin(req);
    return next();
  } catch (error) {
    return refuse(res, error);
  }
}

/** Anyone signed in may look (GET, HEAD); only the computer's owner may change. */
export async function requireSystemAdminForChanges(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return requireSystemAdmin(req, res, next);
}
