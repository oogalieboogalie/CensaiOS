// server/agentMemory/store.js
//
// Postgres access for agent memory (docker/056-agent-memory.sql). Every
// query is scoped to one person and one agent: the same built-in agent keeps
// separate memories for each person who uses it.

import { FactError, planFactWrite } from './facts.js';

const EPISODE_COLUMNS = 'id, agent_id, workspace_id, origin, model, question, answer, summary, tools, created_at';
const FACT_COLUMNS = `id, agent_id, subject, attribute, fact_key, value, valid_from, valid_to, recorded_at,
  superseded_at, superseded_by, change_kind, source, episode_id`;
const MAX_IDENTITY = 2000;

// Agent ids are compared without case everywhere else (outside tools, Share).
const aid = (agentId) => String(agentId).toLowerCase();

/** Plain words to an "any of these words" search, safe for to_tsquery. */
export function searchTerms(text, max = 12) {
  const words = String(text || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  return [...new Set(words)].slice(0, max).join(' | ');
}

export async function recordEpisode(db, { userId, agentId, workspaceId = null, origin, model = null, question, answer, summary, tools = [] }) {
  const { rows } = await db.query(
    `INSERT INTO agent_episodes (user_id, agent_id, workspace_id, origin, model, question, answer, summary, tools)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING ${EPISODE_COLUMNS}`,
    [userId, aid(agentId), workspaceId, origin, model, question, answer, summary, JSON.stringify(tools)],
  );
  return rows[0];
}

export async function recentEpisodes(db, { userId, agentId, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT ${EPISODE_COLUMNS} FROM agent_episodes
     WHERE user_id = $1 AND agent_id = $2 ORDER BY created_at DESC, id DESC LIMIT $3`,
    [userId, aid(agentId), limit],
  );
  return rows;
}

/** Episodes that share words with `query`, best match first, newer first on ties. */
export async function searchEpisodes(db, { userId, agentId, query, limit = 5, excludeId = null }) {
  const terms = searchTerms(query);
  if (!terms) return [];
  const { rows } = await db.query(
    `SELECT ${EPISODE_COLUMNS}, ts_rank(search, to_tsquery('english', $3)) AS rank
     FROM agent_episodes
     WHERE user_id = $1 AND agent_id = $2 AND search @@ to_tsquery('english', $3)
       AND ($5::bigint IS NULL OR id <> $5)
     ORDER BY rank DESC, created_at DESC LIMIT $4`,
    [userId, aid(agentId), terms, limit, excludeId],
  );
  return rows;
}

export async function currentFacts(db, { userId, agentId, limit = 40 }) {
  const { rows } = await db.query(
    `SELECT ${FACT_COLUMNS} FROM agent_facts
     WHERE user_id = $1 AND agent_id = $2 AND superseded_at IS NULL AND valid_to IS NULL
     ORDER BY recorded_at DESC, id DESC LIMIT $3`,
    [userId, aid(agentId), limit],
  );
  return rows;
}

/** Every row ever written for these facts (all keys when `key` is empty). */
export async function factHistory(db, { userId, agentId, key = null }) {
  const { rows } = await db.query(
    `SELECT ${FACT_COLUMNS} FROM agent_facts
     WHERE user_id = $1 AND agent_id = $2 AND ($3::text IS NULL OR fact_key = $3)
     ORDER BY fact_key, recorded_at, id`,
    [userId, aid(agentId), key],
  );
  return rows;
}

async function inTransaction(db, work) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client !== db) client.release?.();
  }
}

/**
 * Remember a fact. Returns { status: 'same' | 'new' | 'change' | 'correction', fact, previous }.
 * `input` comes from normalizeFactInput.
 */
export async function writeFact(db, { userId, agentId, input, source = 'agent', episodeId = null, now = new Date() }) {
  return inTransaction(db, async (client) => {
    const { rows: found } = await client.query(
      `SELECT ${FACT_COLUMNS} FROM agent_facts
       WHERE user_id = $1 AND agent_id = $2 AND fact_key = $3 AND superseded_at IS NULL AND valid_to IS NULL
       FOR UPDATE`,
      [userId, aid(agentId), input.key],
    );
    const current = found[0] || null;
    const plan = planFactWrite(current, input, now);
    if (plan.action === 'same') return { status: 'same', fact: current, previous: null };

    if (current) {
      // Close the old belief first so the "one current row" index allows the new one.
      await client.query('UPDATE agent_facts SET superseded_at = $2 WHERE id = $1', [current.id, now]);
    }
    let written = null;
    for (const row of plan.rows) {
      const { rows } = await client.query(
        `INSERT INTO agent_facts (user_id, agent_id, subject, attribute, fact_key, value, valid_from, valid_to,
           recorded_at, change_kind, source, episode_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${FACT_COLUMNS}`,
        [userId, aid(agentId), row.subject, row.attribute, row.fact_key, row.value, row.valid_from,
          row.valid_to || null, now, row.change_kind, source, episodeId],
      );
      written = rows[0];
    }
    if (current) {
      await client.query('UPDATE agent_facts SET superseded_by = $2 WHERE id = $1', [current.id, written.id]);
    }
    return { status: written.change_kind, fact: written, previous: current };
  });
}

/** Stop believing a fact (nothing replaces it). The row stays as history. */
export async function forgetFact(db, { userId, agentId, factId, now = new Date() }) {
  const { rows } = await db.query(
    `UPDATE agent_facts SET superseded_at = $4
     WHERE id = $3 AND user_id = $1 AND agent_id = $2 AND superseded_at IS NULL
     RETURNING ${FACT_COLUMNS}`,
    [userId, aid(agentId), factId, now],
  );
  if (!rows[0]) throw new FactError('No current fact with that id.', 404);
  return rows[0];
}

export async function getIdentity(db, { userId, agentId }) {
  const { rows } = await db.query(
    `SELECT id, core, recorded_at FROM agent_identity
     WHERE user_id = $1 AND agent_id = $2 AND superseded_at IS NULL`,
    [userId, aid(agentId)],
  );
  return rows[0] || null;
}

export async function identityHistory(db, { userId, agentId, limit = 10 }) {
  const { rows } = await db.query(
    `SELECT id, core, recorded_at, superseded_at FROM agent_identity
     WHERE user_id = $1 AND agent_id = $2 ORDER BY recorded_at DESC, id DESC LIMIT $3`,
    [userId, aid(agentId), limit],
  );
  return rows;
}

/** Save a new version of who the agent is. Empty text clears it. */
export async function setIdentity(db, { userId, agentId, core, now = new Date() }) {
  const text = String(core ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_IDENTITY);
  return inTransaction(db, async (client) => {
    await client.query(
      `UPDATE agent_identity SET superseded_at = $3
       WHERE user_id = $1 AND agent_id = $2 AND superseded_at IS NULL`,
      [userId, aid(agentId), now],
    );
    if (!text) return null;
    const { rows } = await client.query(
      `INSERT INTO agent_identity (user_id, agent_id, core, recorded_at) VALUES ($1, $2, $3, $4)
       RETURNING id, core, recorded_at`,
      [userId, aid(agentId), text, now],
    );
    return rows[0];
  });
}
