// "My modules": modules a person saved from the canvas, so they show up in
// the Add palette on any board. The table is created on first use, so this
// feature needs no boot-order change.

import { MAX_MODULE_SOURCE_BYTES, normalizeManifest, sourceBytes } from '../../src/lib/modules/moduleFormat.js';

export const MAX_SAVED_MODULES = 200;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS user_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  request     TEXT NOT NULL DEFAULT '',
  manifest    JSONB NOT NULL,
  source      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_modules_user_idx ON user_modules (user_id, updated_at DESC);`;

const ready = new WeakMap();

function ensureSchema(db) {
  if (!ready.has(db)) {
    ready.set(db, db.query(SCHEMA).catch((err) => { ready.delete(db); throw err; }));
  }
  return ready.get(db);
}

function libraryError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function row(r) {
  return {
    id: r.id,
    name: r.name,
    request: r.request,
    manifest: r.manifest,
    updatedAt: r.updated_at,
    ...(r.source !== undefined ? { source: r.source } : {}),
  };
}

function requireUser(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw libraryError('Sign in to save modules.', 'AUTHENTICATION_REQUIRED', 401);
  return id;
}

export async function listSavedModules(db, userId) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rows } = await db.query(
    'SELECT id, name, request, manifest, updated_at FROM user_modules WHERE user_id=$1 ORDER BY updated_at DESC LIMIT $2',
    [uid, MAX_SAVED_MODULES],
  );
  return rows.map(row);
}

export async function getSavedModule(db, userId, id) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rows } = await db.query(
    'SELECT id, name, request, manifest, source, updated_at FROM user_modules WHERE user_id=$1 AND id::text=$2',
    [uid, String(id || '')],
  );
  if (!rows[0]) throw libraryError('That module is not in your library.', 'MODULE_NOT_FOUND', 404);
  return row(rows[0]);
}

/** Save a new module, or update one the person already saved (by id). */
export async function saveModule(db, userId, { id = null, request = '', manifest, source }) {
  const uid = requireUser(userId);
  const body = String(source || '');
  if (!body.trim()) throw libraryError('There is no module to save yet.', 'MODULE_SOURCE_REQUIRED');
  if (sourceBytes(body) > MAX_MODULE_SOURCE_BYTES) throw libraryError('This module is too large to save.', 'MODULE_TOO_LARGE', 413);
  const clean = normalizeManifest(manifest, { request });
  await ensureSchema(db);
  if (id) {
    const { rows } = await db.query(
      `UPDATE user_modules SET name=$3, request=$4, manifest=$5, source=$6, updated_at=NOW()
       WHERE user_id=$1 AND id::text=$2 RETURNING id, name, request, manifest, updated_at`,
      [uid, String(id), clean.name, String(request).slice(0, 2000), JSON.stringify(clean), body],
    );
    if (rows[0]) return row(rows[0]);
  }
  const { rows: count } = await db.query('SELECT COUNT(*)::int AS n FROM user_modules WHERE user_id=$1', [uid]);
  if (count[0].n >= MAX_SAVED_MODULES) throw libraryError(`You can keep up to ${MAX_SAVED_MODULES} modules. Delete one first.`, 'MODULE_LIBRARY_FULL', 409);
  const { rows } = await db.query(
    `INSERT INTO user_modules (user_id, name, request, manifest, source) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, request, manifest, updated_at`,
    [uid, clean.name, String(request).slice(0, 2000), JSON.stringify(clean), body],
  );
  return row(rows[0]);
}

export async function deleteSavedModule(db, userId, id) {
  const uid = requireUser(userId);
  await ensureSchema(db);
  const { rowCount } = await db.query('DELETE FROM user_modules WHERE user_id=$1 AND id::text=$2', [uid, String(id || '')]);
  return rowCount > 0;
}
