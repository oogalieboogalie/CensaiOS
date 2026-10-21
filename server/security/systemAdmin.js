import pool from '../db.js';
import { logOwnerRefusal, ownerNamesFor } from './ownerNames.js';

// What a teammate sees when they try something only the computer's owner may
// do (Docker, dev servers, git pushes, host files, tasks, the terminal).
export const OWNER_ONLY_MESSAGE = "Only this computer's owner can do this.";

/**
 * The one place that asks the database for an account's role. Returns the
 * role (it may be null), or undefined when there is no such account. A
 * database error is thrown; each caller decides what that means for it.
 */
export async function userRole(userId, { db = pool } = {}) {
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0] ? rows[0].role : undefined;
}

export async function assertSystemAdmin(req, { db = pool } = {}) {
  const userId = Number(req?.session?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
  }
  if (await userRole(userId, { db }) !== 'admin') {
    throw Object.assign(new Error(OWNER_ONLY_MESSAGE), { statusCode: 403 });
  }
  return { userId, role: 'admin' };
}

async function refuse(req, res, error) {
  const status = error.statusCode || 500;
  if (status === 401 || status === 403) logOwnerRefusal(req.baseUrl || req.path, status);
  // On the desktop app, the person at this computer also gets both account
  // names, so the message can say who to sign in as.
  const names = status === 403 ? await ownerNamesFor(req.session?.userId, { req }) : null;
  return res.status(status).json({
    error: status === 500 ? 'System administrator verification is temporarily unavailable.' : error.message,
    ...(status === 403 ? { reason: 'owner-only', code: 'computer_owner_only' } : {}),
    ...(names ? { ownerName: names.owner, yourName: names.you } : {}),
  });
}

/** Only the computer's owner (the first admin: the desktop app's own user). */
export async function requireSystemAdmin(req, res, next) {
  try {
    await assertSystemAdmin(req);
    return next();
  } catch (error) {
    return refuse(req, res, error);
  }
}

/** Anyone signed in may look (GET, HEAD); only the computer's owner may change. */
export async function requireSystemAdminForChanges(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  return requireSystemAdmin(req, res, next);
}
