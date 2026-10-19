// server/agentMemory/graphStore.js
//
// Postgres access for the time-aware knowledge graph (docker/063-agent-graph.sql).
// Every query is scoped to one person and one agent, like store.js.

import { FactError } from './facts.js';
import { nameKey, planLink } from './graph.js';
import { inTransaction } from './tx.js';

const aid = (agentId) => String(agentId).toLowerCase();

const RELATION_SELECT = `SELECT r.id, r.relation, r.relation_key, r.valid_from, r.valid_to, r.recorded_at,
    r.superseded_at, r.change_kind, r.source, r.from_id, r.to_id,
    f.name AS from_name, f.kind AS from_kind, t.name AS to_name, t.kind AS to_kind
  FROM agent_relations r
  JOIN agent_entities f ON f.id = r.from_id
  JOIN agent_entities t ON t.id = r.to_id`;

async function entityId(client, { userId, agentId, name, kind }) {
  const { rows } = await client.query(
    `INSERT INTO agent_entities (user_id, agent_id, entity_key, name, kind)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, agent_id, entity_key)
     DO UPDATE SET kind = CASE WHEN agent_entities.kind = 'thing' THEN EXCLUDED.kind ELSE agent_entities.kind END
     RETURNING id`,
    [userId, aid(agentId), nameKey(name), name, kind],
  );
  return rows[0].id;
}

async function relationById(client, id) {
  const { rows } = await client.query(`${RELATION_SELECT} WHERE r.id = $1`, [id]);
  return rows[0] || null;
}

/** Stop believing `row`; with `endAt` keep a copy that stopped on that date. */
async function closeRelation(client, { userId, agentId, row, endAt, kind, source, now }) {
  await client.query('UPDATE agent_relations SET superseded_at = $2 WHERE id = $1', [row.id, now]);
  if (!endAt || endAt <= new Date(row.valid_from)) return null;
  const { rows } = await client.query(
    `INSERT INTO agent_relations (user_id, agent_id, from_id, relation, relation_key, to_id, valid_from, valid_to,
       recorded_at, change_kind, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [userId, aid(agentId), row.from_id, row.relation, row.relation_key, row.to_id, row.valid_from, endAt, now, kind, source],
  );
  await client.query('UPDATE agent_relations SET superseded_by = $2 WHERE id = $1', [row.id, rows[0].id]);
  return rows[0].id;
}

/**
 * Remember a connection. Returns { status: 'same' | 'new' | 'ended', relation, closed }.
 * `input` comes from normalizeLinkInput.
 */
export async function writeRelation(db, { userId, agentId, input, source = 'agent', episodeId = null, now = new Date() }) {
  return inTransaction(db, async (client) => {
    const fromId = await entityId(client, { userId, agentId, name: input.from, kind: input.fromKind });
    const toId = await entityId(client, { userId, agentId, name: input.to, kind: input.toKind });
    const { rows: open } = await client.query(
      `${RELATION_SELECT} WHERE r.user_id = $1 AND r.agent_id = $2 AND r.from_id = $3 AND r.relation_key = $4
         AND r.superseded_at IS NULL AND r.valid_to IS NULL FOR UPDATE OF r`,
      [userId, aid(agentId), fromId, input.relationKey],
    );
    const plan = planLink(open, input);
    if (plan.action === 'same') return { status: 'same', relation: plan.row, closed: [] };
    if (plan.action === 'end') {
      const id = await closeRelation(client, { userId, agentId, row: plan.row, endAt: plan.at, kind: 'ended', source, now });
      return { status: 'ended', relation: id ? await relationById(client, id) : plan.row, closed: [plan.row] };
    }
    for (const { row, mode } of plan.close) {
      await closeRelation(client, { userId, agentId, row, endAt: mode === 'ended' ? input.validFrom : null, kind: 'ended', source, now });
    }
    const { rows } = await client.query(
      `INSERT INTO agent_relations (user_id, agent_id, from_id, relation, relation_key, to_id, valid_from, valid_to,
         recorded_at, change_kind, source, episode_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [userId, aid(agentId), fromId, input.relation, input.relationKey, toId, input.validFrom, input.validTo,
        now, plan.close.length ? 'replaced' : 'new', source, episodeId],
    );
    for (const { row } of plan.close) {
      await client.query('UPDATE agent_relations SET superseded_by = $2 WHERE id = $1 AND superseded_by IS NULL', [row.id, rows[0].id]);
    }
    return { status: 'new', relation: await relationById(client, rows[0].id), closed: plan.close.map((c) => c.row) };
  });
}

async function ownOpenRelation(client, { userId, agentId, id }) {
  const { rows } = await client.query(
    `${RELATION_SELECT} WHERE r.id = $3 AND r.user_id = $1 AND r.agent_id = $2 AND r.superseded_at IS NULL FOR UPDATE OF r`,
    [userId, aid(agentId), id],
  );
  if (!rows[0]) throw new FactError('No current connection with that id.', 404);
  return rows[0];
}

/** It stopped being true on `endAt`. The connection stays as a past one. */
export async function endRelation(db, { userId, agentId, id, endAt, source = 'agent', now = new Date() }) {
  return inTransaction(db, async (client) => {
    const row = await ownOpenRelation(client, { userId, agentId, id });
    if (row.valid_to) throw new FactError('That connection has already ended.');
    const at = endAt && endAt < now ? endAt : now;
    const copy = await closeRelation(client, { userId, agentId, row, endAt: at, kind: 'ended', source, now });
    return copy ? relationById(client, copy) : row;
  });
}

/** It was never true: stop believing it, nothing replaces it. */
export async function forgetRelation(db, { userId, agentId, id, now = new Date() }) {
  return inTransaction(db, async (client) => {
    const row = await ownOpenRelation(client, { userId, agentId, id });
    await client.query('UPDATE agent_relations SET superseded_at = $2 WHERE id = $1', [row.id, now]);
    return row;
  });
}

/** Connections the agent believes now and that are still true. */
export async function currentRelations(db, { userId, agentId, limit = 60 }) {
  const { rows } = await db.query(
    `${RELATION_SELECT} WHERE r.user_id = $1 AND r.agent_id = $2 AND r.superseded_at IS NULL AND r.valid_to IS NULL
     ORDER BY r.recorded_at DESC, r.id DESC LIMIT $3`,
    [userId, aid(agentId), limit],
  );
  return rows;
}

/** Every connection row ever written, oldest first (for history and tests). */
export async function relationHistory(db, { userId, agentId }) {
  const { rows } = await db.query(
    `${RELATION_SELECT} WHERE r.user_id = $1 AND r.agent_id = $2 ORDER BY r.recorded_at, r.id`,
    [userId, aid(agentId)],
  );
  return rows;
}

/** What was true on `trueAt`, as the agent knew it at `knownAt` (default now). */
export async function relationsOn(db, { userId, agentId, trueAt, knownAt = new Date() }) {
  const { rows } = await db.query(
    `${RELATION_SELECT} WHERE r.user_id = $1 AND r.agent_id = $2
       AND r.valid_from <= $3 AND (r.valid_to IS NULL OR r.valid_to > $3)
       AND r.recorded_at <= $4 AND (r.superseded_at IS NULL OR r.superseded_at > $4)
     ORDER BY f.name, r.relation, t.name`,
    [userId, aid(agentId), trueAt, knownAt],
  );
  return rows;
}

/** Things the agent knows about, with how many open connections each has. */
export async function entities(db, { userId, agentId }) {
  const { rows } = await db.query(
    `SELECT e.id, e.name, e.kind, e.created_at,
       (SELECT count(*)::int FROM agent_relations r
         WHERE (r.from_id = e.id OR r.to_id = e.id) AND r.superseded_at IS NULL AND r.valid_to IS NULL) AS open_links
     FROM agent_entities e WHERE e.user_id = $1 AND e.agent_id = $2 ORDER BY e.name`,
    [userId, aid(agentId)],
  );
  return rows;
}
