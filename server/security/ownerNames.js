import pool from '../db.js';
import { createLogger } from '../logger.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { isFromAnotherComputer } from '../webOs/door.js';

// When someone who isn't this computer's owner is refused, say which account
// is the owner and which one they are signed in with, so "sign in with the
// owner account" has a name to go with it. Only on the desktop app and only
// to someone sitting at this computer: a shared server never shows the
// owner's name. The 'owner-only' log line says which feature and why, never
// a name or an email.

const log = createLogger('owner-only');
const DISPLAY = "COALESCE(NULLIF(btrim(name), ''), split_part(email, '@', 1))";

export async function ownerNamesFor(userId, { db = pool, mode = getRuntimeMode(), req = null } = {}) {
  if (mode !== RUNTIME_MODES.LOCAL_DESKTOP || (req && isFromAnotherComputer(req, { runtimeMode: mode }))) return null;
  try {
    const owner = (await db.query(`SELECT ${DISPLAY} AS name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]?.name;
    const you = (await db.query(`SELECT ${DISPLAY} AS name FROM users WHERE id = $1`, [Number(userId)])).rows[0]?.name;
    return typeof owner === 'string' && owner && typeof you === 'string' && you ? { owner, you } : null;
  } catch {
    return null;
  }
}

/** One sentence naming both accounts, or '' when they can't be named. */
export function ownerNamesSentence(names) {
  if (!names) return '';
  return `The owner account is ${names.owner}; you're signed in as ${names.you}.`;
}

/** The app-log line for a refusal: the feature, the account number when known, and signed-out or not-the-owner. */
export function logOwnerRefusal(feature, statusCode, account = null) {
  const who = Number.isInteger(account) && account > 0 ? ` for account ${account}` : '';
  log.info(`refused ${feature || 'an owner-only action'}${who}: ${statusCode === 401 ? 'signed out' : 'not the owner'}`);
}
