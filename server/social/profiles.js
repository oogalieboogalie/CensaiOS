// server/social/profiles.js
//
// A person's profile and the boards they show off on it. Showing a board
// off makes a view-only share link for it (spec 5 guest links), so people
// who open it see the same filtered board a view guest sees: windows that
// run on the owner's machine (terminal, files, settings...) stay hidden.
// Taking it off the profile revokes that link.

import { decryptKey, encryptKey } from '../security/vault.js';
import { createShareLink, revokeShareLink } from '../shareLinks/store.js';
import { disconnectShareLink } from '../shareLinks/liveGuests.js';
import { SocialError, cleanText } from './keys.js';

const SHOW_ROLES = ['owner', 'admin'];
export const MAX_SHOWCASE = 12;

function fallbackName(user) {
  return cleanText(user?.name, 60) || cleanText(String(user?.email || '').split('@')[0], 60) || 'Someone';
}

function publicProfile(row) {
  return { id: row.id, userId: Number(row.user_id), name: row.display_name, bio: row.bio || '' };
}

/** This person's profile; made from their account name the first time. */
export async function getOrCreateProfile(db, userId) {
  const found = await db.query('SELECT * FROM social_profiles WHERE user_id = $1', [userId]);
  if (found.rows[0]) return publicProfile(found.rows[0]);
  const user = (await db.query('SELECT name, email FROM users WHERE id = $1', [userId])).rows[0];
  const { rows } = await db.query(
    `INSERT INTO social_profiles (user_id, display_name) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING *`,
    [userId, fallbackName(user)],
  );
  return publicProfile(rows[0]);
}

export async function updateProfile(db, userId, { name, bio } = {}) {
  await getOrCreateProfile(db, userId);
  const display = cleanText(name, 60);
  if (name !== undefined && !display) throw new SocialError('Your profile needs a name.');
  const { rows } = await db.query(
    `UPDATE social_profiles SET display_name = COALESCE($2, display_name),
            bio = COALESCE($3, bio), updated_at = NOW()
      WHERE user_id = $1 RETURNING *`,
    [userId, display || null, bio === undefined ? null : String(bio).trim().slice(0, 280)],
  );
  return publicProfile(rows[0]);
}

/** Everyone on this censaiOS with a profile, with how many boards they show. */
export async function listPeople(db) {
  const { rows } = await db.query(
    `SELECT p.*, (SELECT COUNT(*)::int FROM social_showcase s WHERE s.user_id = p.user_id) AS boards
       FROM social_profiles p ORDER BY p.display_name LIMIT 200`,
  );
  return rows.map((row) => ({ ...publicProfile(row), boards: row.boards }));
}

export async function profileById(db, profileId) {
  const { rows } = await db.query('SELECT * FROM social_profiles WHERE id::text = $1', [String(profileId)]);
  return rows[0] ? publicProfile(rows[0]) : null;
}

/** Boards this person can put on their profile: ones they own or run. */
export async function listShowableBoards(db, userId) {
  const { rows } = await db.query(
    `SELECT w.id, w.name, wm.role, s.id AS showcase_id
       FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
       LEFT JOIN social_showcase s ON s.workspace_id = w.id AND s.user_id = $1
      WHERE wm.user_id = $1 AND wm.role = ANY($2::text[])
      ORDER BY w.updated_at DESC NULLS LAST LIMIT 100`,
    [userId, SHOW_ROLES],
  );
  return rows.map((row) => ({ id: row.id, name: row.name || 'Board', shown: Boolean(row.showcase_id) }));
}

function showcaseRow(row, { withToken = false } = {}) {
  const out = {
    id: row.id, userId: Number(row.user_id), workspaceId: row.workspace_id,
    title: row.title, note: row.note || '', createdAt: row.created_at,
  };
  if (withToken && row.share_token_encrypted) {
    try { out.viewToken = decryptKey(row.share_token_encrypted, Number(row.user_id)); } catch { /* sealed with an older vault key */ }
  }
  return out;
}

/** Boards on a profile, in order. `withToken` adds the view link's secret. */
export async function listShowcase(db, userIds, options = {}) {
  const ids = [].concat(userIds).map(Number).filter(Number.isInteger);
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT * FROM social_showcase WHERE user_id = ANY($1::int[]) ORDER BY user_id, position, created_at`,
    [ids],
  );
  return rows.map((row) => showcaseRow(row, options));
}

export async function showcaseById(db, showcaseId, options = {}) {
  const { rows } = await db.query('SELECT * FROM social_showcase WHERE id::text = $1', [String(showcaseId)]);
  return rows[0] ? showcaseRow(rows[0], options) : null;
}

/** Put a board on this person's profile (or update its title and note). */
export async function showBoard(db, userId, { workspaceId, title, note } = {}) {
  const board = (await db.query(
    `SELECT w.id, w.name FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE w.id = $1 AND wm.user_id = $2 AND wm.role = ANY($3::text[])`,
    [String(workspaceId || ''), userId, SHOW_ROLES],
  )).rows[0];
  if (!board) throw new SocialError('Only an owner or admin of a board can show it off.', 403, 'SOCIAL_NOT_OWNER');
  await getOrCreateProfile(db, userId);
  const name = cleanText(title, 80) || cleanText(board.name, 80) || 'Board';
  const existing = (await db.query('SELECT * FROM social_showcase WHERE user_id = $1 AND workspace_id = $2', [userId, board.id])).rows[0];
  if (existing) {
    const { rows } = await db.query(
      'UPDATE social_showcase SET title = $2, note = $3 WHERE id = $1 RETURNING *',
      [existing.id, name, cleanText(note, 200) || null],
    );
    return showcaseRow(rows[0]);
  }
  const count = (await db.query('SELECT COUNT(*)::int AS n FROM social_showcase WHERE user_id = $1', [userId])).rows[0].n;
  if (count >= MAX_SHOWCASE) throw new SocialError(`A profile shows up to ${MAX_SHOWCASE} boards. Take one off first.`, 409, 'SOCIAL_SHOWCASE_FULL');
  const { link, token } = await createShareLink(db, { workspaceId: board.id, userId, input: { role: 'view', label: 'On my profile' } });
  const { rows } = await db.query(
    `INSERT INTO social_showcase (user_id, workspace_id, title, note, position, share_link_id, share_token_encrypted)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, board.id, name, cleanText(note, 200) || null, count, link.id, encryptKey(token, userId)],
  );
  return showcaseRow(rows[0]);
}

/** Take a board off the profile and close its view link. */
export async function hideBoard(db, userId, showcaseId) {
  const { rows } = await db.query(
    'DELETE FROM social_showcase WHERE user_id = $1 AND id::text = $2 RETURNING workspace_id, share_link_id',
    [userId, String(showcaseId)],
  );
  const row = rows[0];
  if (!row) return false;
  if (row.share_link_id) {
    await revokeShareLink(db, { workspaceId: row.workspace_id, linkId: row.share_link_id });
    try { disconnectShareLink(row.share_link_id); } catch { /* nobody was watching */ }
  }
  return true;
}
