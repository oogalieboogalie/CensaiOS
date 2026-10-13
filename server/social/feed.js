// server/social/feed.js
//
// One person's feed: their own profile's items, everyone they follow here,
// boards they follow here, and the last copy of each profile they follow on
// another censaiOS (refreshed in the background of the request, at most
// every 30 seconds each). Boards come along with a small picture and, for
// boards on this censaiOS, a view link to open them.

import { listFollowRows } from './follows.js';
import { getOrCreateProfile } from './profiles.js';
import { FEED_LIMIT, publicFeed } from './publicFeed.js';
import { refreshRemoteFollow } from './remote.js';

function boardKey(where, id) {
  return `${where}:${id}`;
}

function addFeed(out, feed, { where, prefix, onlyBoard = null, source }) {
  const author = { name: feed.profile?.name || 'Someone', profileId: feed.profile?.id || null, where };
  for (const board of feed.boards || []) {
    if (onlyBoard && board.id !== onlyBoard) continue;
    const key = boardKey(prefix, board.id);
    if (out.boards[key]) continue;
    out.boards[key] = {
      title: board.title, note: board.note || '', windows: Array.isArray(board.windows) ? board.windows.slice(0, 40) : [],
      owner: author.name, where,
      ...(board.viewToken ? { openUrl: `/?join=${encodeURIComponent(board.viewToken)}` } : {}),
    };
  }
  for (const item of feed.items || []) {
    if (onlyBoard && item.board?.id !== onlyBoard) continue;
    const id = `${prefix}:${item.id}`;
    if (out.seen.has(id)) continue;
    out.seen.add(id);
    out.items.push({
      id, kind: item.kind, at: item.at, text: String(item.text || '').slice(0, 500),
      actor: { kind: item.actor?.kind || 'person', name: String(item.actor?.name || author.name).slice(0, 60) },
      author, board: item.board ? { key: boardKey(prefix, item.board.id), title: item.board.title } : null,
      source,
    });
  }
}

/** -> { me, items, boards: { [key]: {...} }, sources: [...] } */
export async function buildFeed(db, userId, options = {}) {
  const me = await getOrCreateProfile(db, userId);
  const follows = await listFollowRows(db, userId);
  const out = { items: [], boards: {}, seen: new Set() };
  const here = { kind: 'here' };
  addFeed(out, await publicFeed(db, userId, { withTokens: true }), { where: 'here', prefix: 'here', source: here });
  const people = follows.filter((row) => row.local_user_id);
  for (const row of people) {
    addFeed(out, await publicFeed(db, row.local_user_id, { withTokens: true }), { where: 'here', prefix: 'here', source: here });
  }
  const followedPeople = new Set(people.map((row) => Number(row.local_user_id)));
  for (const row of follows.filter((f) => f.showcase_id)) {
    const owner = (await db.query('SELECT user_id FROM social_showcase WHERE id = $1', [row.showcase_id])).rows[0];
    if (!owner || followedPeople.has(Number(owner.user_id)) || Number(owner.user_id) === Number(userId)) continue;
    addFeed(out, await publicFeed(db, owner.user_id, { withTokens: true }), {
      where: 'here', prefix: 'here', onlyBoard: String(row.showcase_id), source: here,
    });
  }
  const remote = await Promise.all(follows.filter((f) => f.remote_address).map((row) => refreshRemoteFollow(db, row, options)));
  const sources = [];
  for (const row of remote) {
    const feed = row.remote_cache;
    const source = {
      kind: 'remote', followId: row.id, verified: Boolean(feed?.verified),
      fetchedAt: row.fetched_at, error: row.fetch_error || null,
    };
    sources.push({ ...source, name: feed?.profile?.name || row.label || 'Someone' });
    if (feed) addFeed(out, feed, { where: 'remote', prefix: `r:${row.remote_address}`, onlyBoard: row.remote_board_id || null, source });
  }
  out.items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { me, items: out.items.slice(0, FEED_LIMIT * 2), boards: out.boards, sources };
}
