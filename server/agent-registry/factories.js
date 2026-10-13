// AGENT CARDS — FACTORY MODULE
// CRUD for the agent_cards table. Owner-check is the caller's
// responsibility; factories only do the SQL.

import pool from '../db.js';
import { ensureAgentCardSchema } from './schema.js';

let schemaPromise = null;
const ensureSchema = () => (schemaPromise ||= ensureAgentCardSchema());

const VIS = new Set(['private', 'workspace', 'public']);
const AUTH_TYPES = new Set(['none', 'apiKey', 'oauth2', 'workspace', 'bearer']);
const JSONB_KEYS = new Set(['skills', 'auth', 'metadata']);
const WRITABLE = ['name', 'description', 'version', 'skills', 'endpoint',
  'auth', 'owner_id', 'workspace_id', 'visibility', 'metadata'];

function requireStr(o, k) {
  if (!o || typeof o[k] !== 'string' || !o[k]) throw new Error(`requires non-empty ${k}`);
}
function requireVisibility(v) {
  if (!VIS.has(v)) throw new Error(`visibility must be one of ${[...VIS].join(', ')}`);
}
function requireAuthType(a) {
  if (a && a.type && !AUTH_TYPES.has(a.type)) {
    throw new Error(`auth.type must be one of ${[...AUTH_TYPES].join(', ')}`);
  }
}
function jsonbOr(value, fallback) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function createAgentCard(input) {
  await ensureSchema();
  requireStr(input, 'id'); requireStr(input, 'name'); requireStr(input, 'description');
  const visibility = input.visibility || 'private';
  requireVisibility(visibility);
  requireAuthType(input.auth);
  if (input.skills !== undefined && !Array.isArray(input.skills)) {
    throw new Error('skills must be an array');
  }
  const { rows } = await pool.query(
    `INSERT INTO agent_cards (id, name, description, version, skills, endpoint,
       auth, owner_id, workspace_id, visibility, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9, $10, $11::jsonb)
     RETURNING *`,
    [input.id, input.name, input.description, input.version || '0.1.0',
     jsonbOr(input.skills, []), input.endpoint || null, jsonbOr(input.auth, {}),
     input.owner_id || null, input.workspace_id || null, visibility,
     jsonbOr(input.metadata, {})]
  );
  return rows[0];
}

export async function getAgentCard(id) {
  await ensureSchema();
  if (!id) return null;
  const { rows } = await pool.query(
    'SELECT * FROM agent_cards WHERE id = $1 AND deleted_at IS NULL', [id]
  );
  return rows[0] || null;
}

export async function listAgentCards(opts = {}) {
  await ensureSchema();
  const limit = Math.max(1, Math.min(Number(opts.limit) || 50, 500));
  const offset = Math.max(0, Number(opts.offset) || 0);
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (opts.visibility) { requireVisibility(opts.visibility); params.push(opts.visibility); where.push(`visibility = $${params.length}`); }
  if (opts.owner_id)   { params.push(opts.owner_id);   where.push(`owner_id = $${params.length}`); }
  if (opts.workspace_id){ params.push(opts.workspace_id); where.push(`workspace_id = $${params.length}`); }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM agent_cards WHERE ${where.join(' AND ')}
     ORDER BY created_at ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function updateAgentCard(id, patch) {
  await ensureSchema();
  if (!id) throw new Error('requires id');
  if (!patch || typeof patch !== 'object') throw new Error('requires patch object');
  const fields = []; const values = [];
  for (const key of WRITABLE) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    if (key === 'visibility') requireVisibility(patch[key]);
    if (key === 'auth') requireAuthType(patch[key]);
    const isJsonb = JSONB_KEYS.has(key);
    values.push(isJsonb ? jsonbOr(patch[key], null) : patch[key]);
    fields.push(`${key} = $${values.length}${isJsonb ? '::jsonb' : ''}`);
  }
  if (fields.length === 0) return getAgentCard(id);
  fields.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE agent_cards SET ${fields.join(', ')}
     WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`, values
  );
  return rows[0] || null;
}

export async function deleteAgentCard(id) {
  await ensureSchema();
  if (!id) throw new Error('requires id');
  const { rows } = await pool.query(
    `UPDATE agent_cards SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id]
  );
  return rows[0] || null;
}

export async function upsertSystemAgentCard(card) {
  await ensureSchema();
  if (!card || !card.id) throw new Error('requires card with id');
  const visibility = card.visibility || 'public';
  requireVisibility(visibility);
  const { rows } = await pool.query(
    `INSERT INTO agent_cards (id, name, description, version, skills, endpoint,
       auth, owner_id, workspace_id, visibility, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, NULL, NULL, $8, '{}'::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description,
       version = EXCLUDED.version, skills = EXCLUDED.skills,
       endpoint = COALESCE(EXCLUDED.endpoint, agent_cards.endpoint),
       auth = EXCLUDED.auth, visibility = EXCLUDED.visibility,
       updated_at = NOW(), deleted_at = NULL
     RETURNING *`,
    [card.id, card.name, card.description, card.version || '1.0.0',
     jsonbOr(card.skills, []), card.endpoint || null,
     jsonbOr(card.auth, { type: 'none' }), visibility]
  );
  return rows[0];
}
