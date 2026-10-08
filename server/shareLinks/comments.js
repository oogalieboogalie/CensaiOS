// server/shareLinks/comments.js
//
// Comment pins on the board: one root comment per pin (placed on the board
// or on a window) with threaded replies, @mentions and resolve. Members and
// guests with comment or edit links share this code; the routes only decide
// who the author is. New comments reach everyone who may see them through
// the collaboration socket.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { commentVisibleToLink } from './access.js';
import { readProjectedBoard } from './projector.js';
import {
  getComment,
  insertComment,
  listComments,
  publicComment,
  setCommentResolved,
} from './store.js';

export const MAX_BODY = 2000;
const MAX_COORDINATE = 1_000_000;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const MENTION_PATTERN = /(^|[\s(])@([a-zA-Z0-9][a-zA-Z0-9._-]{0,39})/g;

export class CommentError extends Error {
  constructor(message, statusCode = 400, code = 'COMMENT_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function parseMentionTokens(body) {
  const tokens = new Set();
  for (const match of String(body || '').matchAll(MENTION_PATTERN)) tokens.add(match[2].toLowerCase());
  return [...tokens];
}

// Agents are mentioned by id ("@atlas", "@architect"); names like "The
// Architect" would make a poor handle.
function agentHandle(agent) {
  const id = String(agent?.id || '').toLowerCase();
  if (/^[a-z0-9][a-z0-9._-]{0,39}$/.test(id)) return id;
  return String(agent?.name || '').trim().split(/\s+/)[0].toLowerCase();
}

/** Agents anyone on this board can @mention, as { id, name, handle }. */
export async function listMentionableAgents(db) {
  const { rows } = await db.query('SELECT id, name FROM agents ORDER BY name LIMIT 50');
  return rows.map((agent) => ({ id: agent.id, name: agent.name, handle: agentHandle(agent) }));
}

export async function resolveMentions(db, body) {
  const tokens = parseMentionTokens(body);
  if (tokens.length === 0) return [];
  const agents = await listMentionableAgents(db).catch(() => []);
  return tokens.map((token) => {
    const agent = agents.find((candidate) => candidate.handle === token);
    return agent
      ? { kind: 'agent', id: agent.id, name: agent.name, handle: token }
      : { kind: 'person', handle: token };
  });
}

function validateInput(input = {}) {
  const body = String(input.body ?? '').trim();
  if (!body) throw new CommentError('Write something first.', 400, 'COMMENT_EMPTY');
  if (body.length > MAX_BODY) throw new CommentError('Comments are limited to 2,000 characters.', 400, 'COMMENT_TOO_LONG');
  const threadId = input.threadId ? String(input.threadId) : null;
  const windowId = input.windowId ? String(input.windowId) : null;
  if (windowId && !ID_PATTERN.test(windowId)) throw new CommentError('That window id is not valid.', 400, 'COMMENT_BAD_WINDOW');
  let x = null;
  let y = null;
  if (!threadId) {
    x = Number(input.x);
    y = Number(input.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) {
      throw new CommentError('Pin the comment somewhere on the board.', 400, 'COMMENT_BAD_POSITION');
    }
  }
  return { body, threadId, windowId, x, y };
}

async function visibleWindowIds(workspaceId, link) {
  if (!link || ((link.scope_kind || 'board') === 'board' && !link.stage)) return null;
  const board = await readProjectedBoard(workspaceId, link);
  return new Set(board.wins.map((win) => String(win.id)));
}

/** Comments one viewer may see (link = null for members). */
export async function listVisibleComments(db, { workspaceId, link = null }) {
  const rows = await listComments(db, { workspaceId });
  const visible = await visibleWindowIds(workspaceId, link);
  if (!visible) return rows.map(publicComment);
  const roots = new Set(rows
    .filter((row) => !row.thread_id && commentVisibleToLink(row, link, visible))
    .map((row) => String(row.id)));
  return rows
    .filter((row) => roots.has(String(row.thread_id || row.id)))
    .map(publicComment);
}

/** Send a comment change to members and to guests whose link can see it. */
export async function broadcastComment(workspaceId, row, root) {
  const comment = publicComment(row);
  const scopedVisibility = new Map();
  const guests = [];
  publishWorkspaceEvent(workspaceId, { type: 'comment.upsert', comment });
  // Guests: only comment/edit links, and only pins inside their scope.
  publishWorkspaceEvent(workspaceId, { type: 'comment.upsert', comment }, {
    guests: true,
    filter: (entry) => {
      const link = entry.access?.link;
      if (entry.actor?.type !== 'guest' || !link || link.role === 'view') return false;
      if ((link.scope_kind || 'board') === 'board' && !link.stage) return true;
      guests.push(entry);
      return false;
    },
  });
  for (const entry of guests) {
    const link = entry.access.link;
    const key = `${link.id}:${link.stage}`;
    if (!scopedVisibility.has(key)) scopedVisibility.set(key, await visibleWindowIds(workspaceId, link));
    if (commentVisibleToLink(root, link, scopedVisibility.get(key))) {
      try { entry.send({ type: 'comment.upsert', comment }); } catch { /* closing */ }
    }
  }
}

export async function createComment(db, { workspaceId, author, link = null, input }) {
  const fields = validateInput(input);
  let root = null;
  if (fields.threadId) {
    root = await getComment(db, { workspaceId, commentId: fields.threadId });
    if (!root || root.thread_id) throw new CommentError('That thread no longer exists.', 404, 'COMMENT_THREAD_MISSING');
  }
  if (link) {
    const visible = await visibleWindowIds(workspaceId, link);
    const target = root || { window_id: fields.windowId };
    if (visible && !commentVisibleToLink(target, link, visible)) {
      throw new CommentError('This link can only comment on what it shares.', 403, 'COMMENT_OUT_OF_SCOPE');
    }
  }
  const mentions = await resolveMentions(db, fields.body);
  const row = await insertComment(db, {
    workspaceId,
    threadId: root?.id || null,
    linkId: link?.id || null,
    authorKind: author.kind,
    authorId: author.id,
    authorName: author.name,
    authorColor: author.color,
    body: fields.body,
    x: root ? null : fields.x,
    y: root ? null : fields.y,
    windowId: root ? null : fields.windowId,
    mentions,
  });
  await broadcastComment(workspaceId, row, root || row);
  return { row, root: root || row, mentions };
}

export async function setResolved(db, { workspaceId, commentId, resolved, by, link = null }) {
  if (link) {
    const existing = await getComment(db, { workspaceId, commentId });
    const visible = await visibleWindowIds(workspaceId, link);
    if (!existing || (visible && !commentVisibleToLink(existing, link, visible))) {
      throw new CommentError('That comment is not on what this link shares.', 404, 'COMMENT_MISSING');
    }
  }
  const row = await setCommentResolved(db, { workspaceId, commentId, resolved, by });
  if (!row) throw new CommentError('That comment no longer exists.', 404, 'COMMENT_MISSING');
  await broadcastComment(workspaceId, row, row);
  return row;
}
