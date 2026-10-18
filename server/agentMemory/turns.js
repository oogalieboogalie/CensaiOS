// server/agentMemory/turns.js
//
// Postgres access for the conversation itself (docker/068-agent-turns.sql):
// every message, word for word, with the time it was sent, grouped by the
// chat it belongs to. Every query is scoped to one person.

import { searchTerms } from './searchTerms.js';

const TURN_COLUMNS = 'id, agent_id, workspace_id, conversation_id, window_id, origin, speaker, text, at';
const MAX_TEXT = 20000;
const aid = (agentId) => String(agentId).toLowerCase();

/**
 * Save a run's new messages. `turns` is [{ speaker, text, at }]. A message
 * already saved for this chat (same speaker, words and time) is skipped, so a
 * re-sent chat never doubles up.
 */
export async function recordTurns(db, { userId, agentId, workspaceId = null, conversationId, windowId = null, origin = 'chat', turns = [] }) {
  const saved = [];
  for (const turn of turns) {
    const text = String(turn?.text || '').slice(0, MAX_TEXT);
    if (!text.trim() || !['person', 'agent'].includes(turn.speaker)) continue;
    const at = turn.at ? new Date(turn.at) : new Date();
    const when = Number.isNaN(at.getTime()) ? new Date() : at;
    const { rows } = await db.query(
      `INSERT INTO agent_turns (user_id, agent_id, workspace_id, conversation_id, window_id, origin, speaker, text, at)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
       WHERE NOT EXISTS (
         SELECT 1 FROM agent_turns WHERE user_id = $1 AND conversation_id = $4 AND speaker = $7 AND text = $8 AND at = $9
       )
       RETURNING ${TURN_COLUMNS}`,
      [userId, aid(agentId), workspaceId, String(conversationId).slice(0, 200), windowId, origin, turn.speaker, text, when],
    );
    if (rows[0]) saved.push(rows[0]);
  }
  return saved;
}

/** Every message of one chat, oldest first. */
export async function conversationTurns(db, { userId, conversationId, limit = 400 }) {
  const { rows } = await db.query(
    `SELECT ${TURN_COLUMNS} FROM agent_turns
     WHERE user_id = $1 AND conversation_id = $2 ORDER BY at, id LIMIT $3`,
    [userId, conversationId, limit],
  );
  return rows;
}

/** Messages that share words with `query` (best match first), outside the current chat. */
export async function searchTurns(db, { userId, agentId, query, excludeConversation = null, limit = 6 }) {
  const terms = searchTerms(query);
  if (!terms) return [];
  const { rows } = await db.query(
    `SELECT ${TURN_COLUMNS}, ts_rank(search, to_tsquery('english', $3)) AS rank
     FROM agent_turns
     WHERE user_id = $1 AND agent_id = $2 AND search @@ to_tsquery('english', $3)
       AND ($5::text IS NULL OR conversation_id <> $5)
     ORDER BY rank DESC, at DESC LIMIT $4`,
    [userId, aid(agentId), terms, limit, excludeConversation],
  );
  return rows;
}

/** Messages sent between two times (for "what did we talk about on Tuesday"). */
export async function turnsBetween(db, { userId, agentId, from, to, limit = 60 }) {
  const { rows } = await db.query(
    `SELECT ${TURN_COLUMNS} FROM agent_turns
     WHERE user_id = $1 AND agent_id = $2 AND at >= $3 AND at < $4 ORDER BY at, id LIMIT $5`,
    [userId, aid(agentId), from, to, limit],
  );
  return rows;
}

/**
 * Recent chats, newest first: one row per conversation with its first and
 * last message and times. `agentId` and `workspaceId` narrow the list.
 */
export async function recentConversations(db, { userId, agentId = null, workspaceId = null, exclude = null, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT c.conversation_id, c.agent_id, c.workspace_id, c.window_id, c.origin, c.started_at, c.last_at, c.turns,
            w.name AS workspace_name,
            (SELECT text FROM agent_turns f WHERE f.user_id = $1 AND f.conversation_id = c.conversation_id AND f.speaker = 'person'
              ORDER BY f.at, f.id LIMIT 1) AS first_text,
            (SELECT text FROM agent_turns l WHERE l.user_id = $1 AND l.conversation_id = c.conversation_id
              ORDER BY l.at DESC, l.id DESC LIMIT 1) AS last_text
     FROM (
       SELECT conversation_id, min(agent_id) AS agent_id, max(workspace_id) AS workspace_id, max(window_id) AS window_id,
              min(origin) AS origin, min(at) AS started_at, max(at) AS last_at, count(*)::int AS turns
       FROM agent_turns
       WHERE user_id = $1 AND ($2::text IS NULL OR agent_id = $2) AND ($3::text IS NULL OR workspace_id = $3)
         AND ($5::text IS NULL OR conversation_id <> $5)
       GROUP BY conversation_id
       ORDER BY max(at) DESC LIMIT $4
     ) c
     LEFT JOIN workspaces w ON w.id = c.workspace_id
     ORDER BY c.last_at DESC`,
    [userId, agentId ? aid(agentId) : null, workspaceId, limit, exclude],
  );
  return rows;
}

/** The last few messages of a chat, oldest first. */
export async function lastTurns(db, { userId, conversationId, limit = 4 }) {
  const { rows } = await db.query(
    `SELECT * FROM (SELECT ${TURN_COLUMNS} FROM agent_turns
       WHERE user_id = $1 AND conversation_id = $2 ORDER BY at DESC, id DESC LIMIT $3) t
     ORDER BY at, id`,
    [userId, conversationId, limit],
  );
  return rows;
}

/** Messages around one message of a chat (the one before it and a few after). */
export async function turnsAround(db, { userId, conversationId, at, before = 1, after = 2 }) {
  const { rows } = await db.query(
    `(SELECT ${TURN_COLUMNS} FROM agent_turns WHERE user_id = $1 AND conversation_id = $2 AND at < $3
       ORDER BY at DESC, id DESC LIMIT $4)
     UNION ALL
     (SELECT ${TURN_COLUMNS} FROM agent_turns WHERE user_id = $1 AND conversation_id = $2 AND at >= $3
       ORDER BY at, id LIMIT $5)
     ORDER BY at, id`,
    [userId, conversationId, at, before, after + 1],
  );
  return rows;
}
