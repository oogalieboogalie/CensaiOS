// server/agentEndpoints/store.js
//
// Postgres access for agent endpoints. Every management query is scoped to
// the signed-in owner (user_id); the public side only ever looks a key up by
// its hash and then reads the one endpoint that key belongs to.

import { createEndpointToken, hashEndpointToken, tokenHint } from './tokens.js';

const ENDPOINT_COLUMNS = 'id, user_id, workspace_id, card_id, agent_id, agent_name, window_id, enabled, created_at, updated_at';
const MAX_LABEL = 60;
const MAX_QUESTION = 280;

export class AgentEndpointError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function cleanLabel(value) {
  // eslint-disable-next-line no-control-regex
  const label = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return label.slice(0, MAX_LABEL) || 'Key';
}

export async function listEndpoints(db, { userId, workspaceId }) {
  const { rows } = await db.query(
    `SELECT ${ENDPOINT_COLUMNS} FROM agent_endpoints WHERE user_id = $1 AND workspace_id = $2 ORDER BY created_at`,
    [userId, workspaceId],
  );
  return rows;
}

export async function getEndpoint(db, { userId, endpointId }) {
  const { rows } = await db.query(
    `SELECT ${ENDPOINT_COLUMNS} FROM agent_endpoints WHERE id = $1 AND user_id = $2`,
    [endpointId, userId],
  );
  return rows[0] || null;
}

export async function getEndpointById(db, endpointId) {
  const { rows } = await db.query(`SELECT ${ENDPOINT_COLUMNS} FROM agent_endpoints WHERE id = $1`, [endpointId]);
  return rows[0] || null;
}

/** Create (or find) the endpoint for one agent card. New endpoints start off. */
export async function upsertEndpoint(db, { userId, workspaceId, cardId, agentId, agentName, windowId }) {
  const { rows } = await db.query(
    `INSERT INTO agent_endpoints (user_id, workspace_id, card_id, agent_id, agent_name, window_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, workspace_id, card_id)
     DO UPDATE SET agent_name = EXCLUDED.agent_name,
                   window_id = COALESCE(EXCLUDED.window_id, agent_endpoints.window_id),
                   updated_at = NOW()
     RETURNING ${ENDPOINT_COLUMNS}`,
    [userId, workspaceId, cardId, agentId, agentName, windowId || null],
  );
  return rows[0];
}

export async function setEndpointEnabled(db, { userId, endpointId, enabled }) {
  const { rows } = await db.query(
    `UPDATE agent_endpoints SET enabled = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2 RETURNING ${ENDPOINT_COLUMNS}`,
    [endpointId, userId, Boolean(enabled)],
  );
  return rows[0] || null;
}

export async function listTokens(db, { endpointId }) {
  const { rows } = await db.query(
    `SELECT id, endpoint_id, label, token_hint, created_at, last_used_at, revoked_at
       FROM agent_endpoint_tokens WHERE endpoint_id = $1 ORDER BY created_at DESC`,
    [endpointId],
  );
  return rows;
}

/** Returns { token, row }. The plain key exists only in this return value. */
export async function createToken(db, { endpointId, label }) {
  const token = createEndpointToken();
  const { rows } = await db.query(
    `INSERT INTO agent_endpoint_tokens (endpoint_id, label, token_hash, token_hint)
     VALUES ($1, $2, $3, $4)
     RETURNING id, endpoint_id, label, token_hint, created_at, last_used_at, revoked_at`,
    [endpointId, cleanLabel(label), hashEndpointToken(token), tokenHint(token)],
  );
  return { token, row: rows[0] };
}

export async function revokeToken(db, { endpointId, tokenId }) {
  const { rows } = await db.query(
    `UPDATE agent_endpoint_tokens SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE id = $1 AND endpoint_id = $2
      RETURNING id, endpoint_id, label, token_hint, created_at, last_used_at, revoked_at`,
    [tokenId, endpointId],
  );
  return rows[0] || null;
}

/** Public side: the live key row and its endpoint, or null. */
export async function findTokenByValue(db, token) {
  const { rows } = await db.query(
    `SELECT t.id AS token_id, t.label AS token_label, t.revoked_at, e.*
       FROM agent_endpoint_tokens t JOIN agent_endpoints e ON e.id = t.endpoint_id
      WHERE t.token_hash = $1`,
    [hashEndpointToken(token)],
  );
  return rows[0] || null;
}

export async function touchToken(db, tokenId) {
  await db.query('UPDATE agent_endpoint_tokens SET last_used_at = NOW() WHERE id = $1', [tokenId]);
}

export async function logCall(db, call) {
  await db.query(
    `INSERT INTO agent_endpoint_calls (endpoint_id, token_id, via, status, question, answer_chars, duration_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      call.endpointId, call.tokenId || null, call.via, call.status,
      String(call.question || '').slice(0, MAX_QUESTION), Number(call.answerChars) || 0,
      Math.max(0, Math.round(Number(call.durationMs) || 0)), call.error ? String(call.error).slice(0, 300) : null,
    ],
  );
}

export async function listCalls(db, { endpointId, limit = 20 }) {
  const { rows } = await db.query(
    `SELECT c.id, c.via, c.status, c.question, c.answer_chars, c.duration_ms, c.error, c.created_at, t.label AS token_label
       FROM agent_endpoint_calls c LEFT JOIN agent_endpoint_tokens t ON t.id = c.token_id
      WHERE c.endpoint_id = $1 ORDER BY c.created_at DESC LIMIT $2`,
    [endpointId, Math.min(100, Math.max(1, Number(limit) || 20))],
  );
  return rows;
}
