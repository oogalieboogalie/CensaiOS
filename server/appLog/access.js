/**
 * Who may read the app's log. The computer's owner always may. On the PC's
 * own board (local_desktop) any signed-in account may too: everyone there is
 * the same household, the person's everyday account is often not the owner
 * account, and the lines are already scrubbed of keys, tokens and emails.
 * On a shared server only the owner reads it.
 */
import pool from '../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

export async function canReadAppLog(userId, { db = pool, mode = getRuntimeMode() } = {}) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return false;
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [id]);
  const role = rows[0]?.role;
  if (role === 'admin') return true;
  return mode === RUNTIME_MODES.LOCAL_DESKTOP && role === 'user';
}
