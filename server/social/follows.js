// server/social/follows.js
//
// Who and what a person follows: a person or one board on this censaiOS,
// or a person (or one of their boards) on another censaiOS by address and
// key. The key is sealed with the follower's vault key, never shown again.

import { encryptKey } from '../security/vault.js';
import { SocialError, isProfileKeyShape } from './keys.js';
import { profileById, showcaseById } from './profiles.js';
import { fetchRemoteFeed, parseProfileAddress } from './remote.js';

const COLUMNS = `f.id, f.user_id, f.target_kind, f.local_user_id, f.showcase_id, f.remote_address,
  f.remote_board_id, f.remote_install_id, f.key_encrypted, f.label, f.remote_cache, f.fetched_at,
  f.fetch_error, f.created_at`;

export async function listFollowRows(db, userId) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM social_follows f WHERE f.user_id = $1 ORDER BY f.created_at`, [userId],
  );
  return rows;
}

/** Follows as the Social window shows them. */
export async function listFollows(db, userId) {
  const rows = await listFollowRows(db, userId);
  const { rows: names } = await db.query(
    `SELECT p.user_id, p.id, p.display_name FROM social_profiles p
      WHERE p.user_id = ANY($1::int[]) OR p.user_id IN (SELECT s.user_id FROM social_showcase s WHERE s.id = ANY($2::uuid[]))`,
    [rows.map((row) => row.local_user_id).filter(Boolean), rows.map((row) => row.showcase_id).filter(Boolean)],
  );
  const byUser = new Map(names.map((row) => [Number(row.user_id), row]));
  const out = [];
  for (const row of rows) {
    const base = { id: row.id, kind: row.target_kind, createdAt: row.created_at };
    if (row.remote_address) {
      const feed = row.remote_cache || {};
      const board = row.remote_board_id ? (feed.boards || []).find((b) => b.id === row.remote_board_id) : null;
      out.push({
        ...base, where: 'remote', name: feed.profile?.name || row.label || 'Someone',
        board: row.remote_board_id ? { id: row.remote_board_id, title: board?.title || 'A board' } : null,
        address: row.remote_address, error: row.fetch_error || null, fetchedAt: row.fetched_at, verified: Boolean(feed.verified),
      });
    } else if (row.showcase_id) {
      const board = await showcaseById(db, row.showcase_id);
      const owner = board ? byUser.get(board.userId) : null;
      out.push({ ...base, where: 'here', name: owner?.display_name || 'Someone', profileId: owner?.id || null, board: board ? { id: board.id, title: board.title } : null });
    } else {
      const person = byUser.get(Number(row.local_user_id));
      out.push({ ...base, where: 'here', name: person?.display_name || 'Someone', profileId: person?.id || null, board: null });
    }
  }
  return out;
}

async function insertFollow(db, values) {
  const { rows } = await db.query(
    `INSERT INTO social_follows (user_id, target_kind, local_user_id, showcase_id, remote_address, remote_board_id,
       remote_install_id, key_encrypted, label, remote_cache, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
     ON CONFLICT DO NOTHING RETURNING id`,
    [values.userId, values.kind, values.localUserId ?? null, values.showcaseId ?? null, values.address ?? null,
      values.boardId ?? null, values.installId ?? null, values.keyEncrypted ?? null, values.label ?? null,
      values.cache ? JSON.stringify(values.cache) : null, values.cache ? new Date() : null],
  );
  return { id: rows[0]?.id || null, already: !rows[0] };
}

/** Follow a person (profile id) or one of their boards (board id) here. */
export async function followHere(db, userId, { profileId, boardId } = {}) {
  if (boardId) {
    const board = await showcaseById(db, boardId);
    if (!board) throw new SocialError('That board is no longer on a profile.', 404, 'SOCIAL_NO_BOARD');
    if (board.userId === Number(userId)) throw new SocialError('That is your own board; it is already in your feed.', 409, 'SOCIAL_SELF');
    return insertFollow(db, { userId, kind: 'board', showcaseId: board.id });
  }
  const profile = await profileById(db, profileId);
  if (!profile) throw new SocialError('No one here has that profile.', 404, 'SOCIAL_NO_PROFILE');
  if (profile.userId === Number(userId)) throw new SocialError('That is you; your own posts are always in your feed.', 409, 'SOCIAL_SELF');
  return insertFollow(db, { userId, kind: 'person', localUserId: profile.userId });
}

/** Follow someone on another censaiOS: check the address and key once, keep the first copy. */
export async function followRemote(db, userId, { address: rawAddress, key: rawKey, boardId } = {}, options = {}) {
  const address = parseProfileAddress(rawAddress);
  const key = String(rawKey || '').trim();
  if (!isProfileKeyShape(key)) throw new SocialError('Paste their key too. It starts with csk_.', 400, 'SOCIAL_KEY_REQUIRED');
  const got = await fetchRemoteFeed(address, key, options);
  if (boardId && !(got.feed.boards || []).some((board) => board.id === String(boardId))) {
    throw new SocialError('That board is not on their profile.', 404, 'SOCIAL_NO_BOARD');
  }
  return insertFollow(db, {
    userId, kind: boardId ? 'board' : 'person', address: address.url, boardId: boardId ? String(boardId) : null,
    installId: got.installId, keyEncrypted: encryptKey(key, Number(userId)),
    label: String(got.feed.profile?.name || '').slice(0, 60) || null, cache: { ...got.feed, verified: got.verified },
  });
}

export async function unfollow(db, userId, followId) {
  const { rowCount } = await db.query('DELETE FROM social_follows WHERE user_id = $1 AND id::text = $2', [userId, String(followId)]);
  return rowCount > 0;
}
