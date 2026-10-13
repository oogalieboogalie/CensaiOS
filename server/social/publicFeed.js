// server/social/publicFeed.js
//
// What a person's followers see: their profile, the boards they show off
// (with a small picture of each), and a feed of what happened on those
// boards: their posts, people building, and their agents working. The same
// shape goes to followers on this censaiOS and, signed, to followers on
// another one (publicDoor.js). Only boards on the profile ever appear.

import { boardActivity, boardPreview } from './activity.js';
import { getOrCreateProfile, listShowcase } from './profiles.js';

export const FEED_LIMIT = 60;
const CACHE_MS = 15_000;
const cache = new Map();

export function forgetPublicFeed(userId) {
  cache.delete(Number(userId));
}

function byNewest(a, b) {
  return String(b.at).localeCompare(String(a.at));
}

async function postsFor(db, userId, boardsByWorkspace) {
  const { rows } = await db.query(
    `SELECT id, workspace_id, kind, agent_name, body, created_at FROM social_posts
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, FEED_LIMIT],
  );
  return rows
    .filter((row) => row.kind === 'post' || boardsByWorkspace.has(row.workspace_id))
    .map((row) => {
      const board = boardsByWorkspace.get(row.workspace_id) || null;
      return {
        id: `${row.kind}:${row.id}`,
        kind: row.kind,
        at: new Date(row.created_at).toISOString(),
        actor: row.kind === 'agent' ? { kind: 'agent', name: row.agent_name || 'An agent' } : { kind: 'person', name: null },
        board: board ? { id: board.id, title: board.title } : null,
        text: row.body,
      };
    });
}

/**
 * { profile, boards: [{ id, title, note, windows, viewToken? }], items }
 * `withTokens` adds each board's view-link secret (followers on this
 * censaiOS open boards with it; it never leaves this computer).
 */
export async function publicFeed(db, userId, { withTokens = false } = {}) {
  const key = Number(userId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return strip(hit.value, withTokens);
  const profile = await getOrCreateProfile(db, key);
  const shown = await listShowcase(db, key, { withToken: true });
  const boardsByWorkspace = new Map(shown.map((board) => [board.workspaceId, board]));
  const boards = [];
  const items = await postsFor(db, key, boardsByWorkspace);
  for (const board of shown) {
    const preview = await boardPreview(board.workspaceId);
    boards.push({ id: board.id, title: board.title, note: board.note, windows: preview.windows, viewToken: board.viewToken || null });
    items.push({
      id: `shown:${board.id}`, kind: 'shown', at: new Date(board.createdAt).toISOString(),
      actor: { kind: 'person', name: null }, board: { id: board.id, title: board.title },
      text: `put ${board.title} on their profile`,
    });
    for (const event of await boardActivity(db, board.workspaceId)) {
      items.push({
        id: `built:${board.id}:${event.seq}`, kind: 'built', at: event.at,
        actor: { kind: event.who.kind, name: event.who.name },
        board: { id: board.id, title: board.title },
        // "added PDF and Notes to Launch board", "worked on 2 windows on Launch board"
        text: `${event.text} ${event.onlyAdded ? 'to' : 'on'} ${board.title}`,
      });
    }
  }
  for (const item of items) if (item.actor.kind === 'person' && !item.actor.name) item.actor.name = profile.name;
  items.sort(byNewest);
  const value = { profile: { id: profile.id, name: profile.name, bio: profile.bio }, boards, items: items.slice(0, FEED_LIMIT) };
  cache.set(key, { at: Date.now(), value });
  return strip(value, withTokens);
}

function strip(value, withTokens) {
  if (withTokens) return value;
  return { ...value, boards: value.boards.map(({ viewToken: _token, ...board }) => board) };
}
