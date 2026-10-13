// server/outsideTools/store.js
//
// Postgres access for outside tool servers. Every query is scoped to the
// signed-in owner. A server's key goes into the key vault (user_api_keys,
// encrypted per user, provider "mcp:<server id>"), never into this table.

import { decryptKey, encryptKey } from '../security/vault.js';
import { serverSlug } from './toolNames.js';

const COLUMNS = `id, user_id, name, slug, transport, url, command, args, secret_env, has_secret, enabled,
  tools, last_checked_at, last_error, created_at, updated_at`;
const MAX_NAME = 40;

export class OutsideToolStoreError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const vaultProvider = (serverId) => `mcp:${serverId}`;

export function cleanName(value) {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

async function freeSlug(db, userId, name) {
  const base = serverSlug(name);
  const { rows } = await db.query('SELECT slug FROM outside_tool_servers WHERE user_id = $1', [userId]);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const slug = `${base.slice(0, 13)}_${i}`;
    if (!taken.has(slug)) return slug;
  }
  throw new OutsideToolStoreError('Too many tool servers with that name.');
}

export async function listServers(db, { userId }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM outside_tool_servers WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return rows;
}

export async function getServer(db, { userId, serverId }) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM outside_tool_servers WHERE id = $1 AND user_id = $2`, [serverId, userId]);
  return rows[0] || null;
}

export async function createServer(db, { userId, name, transport, url = null, command = null, args = [], secretEnv = null }) {
  const clean = cleanName(name);
  if (!clean) throw new OutsideToolStoreError('Give the tool server a name.');
  const slug = await freeSlug(db, userId, clean);
  const { rows } = await db.query(
    `INSERT INTO outside_tool_servers (user_id, name, slug, transport, url, command, args, secret_env)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING ${COLUMNS}`,
    [userId, clean, slug, transport, url, command, JSON.stringify(args || []), secretEnv],
  );
  return rows[0];
}

export async function setEnabled(db, { userId, serverId, enabled }) {
  const { rows } = await db.query(
    `UPDATE outside_tool_servers SET enabled = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [serverId, userId, Boolean(enabled)],
  );
  return rows[0] || null;
}

export async function saveCheck(db, { userId, serverId, tools = null, error = null }) {
  const { rows } = await db.query(
    `UPDATE outside_tool_servers
        SET tools = COALESCE($3::jsonb, tools), last_error = $4, last_checked_at = NOW()
      WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
    [serverId, userId, tools ? JSON.stringify(tools) : null, error ? String(error).slice(0, 400) : null],
  );
  return rows[0] || null;
}

export async function deleteServer(db, { userId, serverId }) {
  const { rowCount } = await db.query('DELETE FROM outside_tool_servers WHERE id = $1 AND user_id = $2', [serverId, userId]);
  await db.query('DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2', [userId, vaultProvider(serverId)]);
  return rowCount > 0;
}

export async function saveSecret(db, { userId, serverId, secret }) {
  const value = String(secret || '').trim();
  if (!value) {
    await db.query('DELETE FROM user_api_keys WHERE user_id = $1 AND provider = $2', [userId, vaultProvider(serverId)]);
  } else {
    if (value.length > 8192) throw new OutsideToolStoreError('That key is too long.');
    await db.query(
      `INSERT INTO user_api_keys (user_id, provider, api_key_encrypted, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, provider) DO UPDATE SET api_key_encrypted = $3, updated_at = NOW()`,
      [userId, vaultProvider(serverId), encryptKey(value, userId)],
    );
  }
  await db.query('UPDATE outside_tool_servers SET has_secret = $3, updated_at = NOW() WHERE id = $1 AND user_id = $2',
    [serverId, userId, Boolean(value)]);
}

export async function readSecret(db, { userId, server }) {
  if (!server?.has_secret) return '';
  const { rows } = await db.query('SELECT api_key_encrypted FROM user_api_keys WHERE user_id = $1 AND provider = $2',
    [userId, vaultProvider(server.id)]);
  return rows[0] ? decryptKey(rows[0].api_key_encrypted, userId) : '';
}

export async function grantsFor(db, { userId, agentId = null }) {
  const { rows } = await db.query(
    `SELECT g.server_id, g.agent_id FROM outside_tool_grants g
       JOIN outside_tool_servers s ON s.id = g.server_id
      WHERE s.user_id = $1 AND ($2::text IS NULL OR lower(g.agent_id) = lower($2::text))`,
    [userId, agentId],
  );
  return rows;
}

export async function setGrant(db, { userId, serverId, agentId, allowed }) {
  const server = await getServer(db, { userId, serverId });
  if (!server) return null;
  if (allowed) {
    await db.query(`INSERT INTO outside_tool_grants (server_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [serverId, agentId]);
  } else {
    await db.query('DELETE FROM outside_tool_grants WHERE server_id = $1 AND lower(agent_id) = lower($2)', [serverId, agentId]);
  }
  return server;
}

/** Enabled servers this agent was given, with their cached tool lists. */
export async function serversForAgent(db, { userId, agentId }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS.split(',').map((c) => `s.${c.trim()}`).join(', ')}
       FROM outside_tool_servers s JOIN outside_tool_grants g ON g.server_id = s.id
      WHERE s.user_id = $1 AND s.enabled AND lower(g.agent_id) = lower($2) ORDER BY s.created_at`,
    [userId, agentId],
  );
  return rows;
}

export async function recordCall(db, call) {
  await db.query(
    `INSERT INTO outside_tool_calls (server_id, user_id, agent_id, tool, origin, ok, duration_ms, result_chars, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [call.serverId, call.userId, call.agentId, call.tool, call.origin, call.ok, Math.round(call.durationMs || 0),
      call.resultChars || 0, call.error ? String(call.error).slice(0, 400) : null],
  );
}

export async function recentCalls(db, { userId, agentId, limit = 15 }) {
  const { rows } = await db.query(
    `SELECT c.id, c.tool, c.origin, c.ok, c.duration_ms, c.error, c.created_at, s.name AS server_name
       FROM outside_tool_calls c JOIN outside_tool_servers s ON s.id = c.server_id
      WHERE c.user_id = $1 AND lower(c.agent_id) = lower($2) ORDER BY c.created_at DESC LIMIT $3`,
    [userId, agentId, limit],
  );
  return rows;
}
