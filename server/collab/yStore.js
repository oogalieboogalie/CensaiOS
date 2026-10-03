// server/collab/yStore.js
//
// Phase 2: Postgres persistence for per-workspace Yjs documents.
//
// One row per workspace in workspace_yjs_docs (see
// docker/045-workspace-yjs-docs.sql) holds the full encoded Y update.
// BYTEA transport: pg takes a Buffer param on write and returns a Buffer on
// read; encode/decode helpers below keep that conversion in one place.
//
// Writes are TRAILING-EDGE debounced per workspace (YDOC_SAVE_DEBOUNCE_MS):
// N rapid scheduleSave calls collapse into ONE upsert fired after the last
// call. Use saveNow/flush when durability matters (tests, shutdown).
//
// Reads return the raw update bytes, or null when no row exists or the
// stored schema_version differs from SCHEMA_VERSION. A mismatch is logged
// and treated as "needs reseed" — never thrown, so boot never crashes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { ID_PATTERN, SCHEMA_VERSION } from './ySchema.js';
import { createLogger } from '../logger.js';

const log = createLogger('yjs-persist');

// Trailing-edge debounce: rapid scheduleSave calls for one workspace
// collapse into a single upsert this many ms after the LAST call.
export const YDOC_SAVE_DEBOUNCE_MS = 750;

export const YDOC_TABLE = 'workspace_yjs_docs';

const UPSERT_YDOC_SQL = `INSERT INTO ${YDOC_TABLE} (workspace_id, yupdate, schema_version, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (workspace_id) DO UPDATE SET
  yupdate = EXCLUDED.yupdate,
  schema_version = EXCLUDED.schema_version,
  updated_at = NOW()`;

const SELECT_YDOC_SQL = `SELECT workspace_id, yupdate, schema_version, updated_at
FROM ${YDOC_TABLE} WHERE workspace_id = $1`;

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATH = path.resolve(here, '../../docker/045-workspace-yjs-docs.sql');

function assertWorkspaceId(workspaceId) {
  if (!ID_PATTERN.test(String(workspaceId ?? ''))) {
    throw new Error(`yjs-persist: invalid workspaceId ${String(workspaceId)}`);
  }
}

function toBytes(docOrUpdate) {
  if (docOrUpdate instanceof Y.Doc) return Buffer.from(Y.encodeStateAsUpdate(docOrUpdate));
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(docOrUpdate)) return docOrUpdate;
  if (docOrUpdate instanceof Uint8Array) return Buffer.from(docOrUpdate);
  throw new Error('yjs-persist: save needs a Y.Doc or Uint8Array update');
}

/** Y.Doc -> Buffer (BYTEA-ready). Accepts a Y.Doc or a raw update. */
export function encodeDocUpdate(docOrUpdate) {
  return toBytes(docOrUpdate);
}

/** BYTEA column value (Buffer) -> Uint8Array for Y.applyUpdate. */
export function decodeDocUpdate(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Idempotent table bootstrap (CREATE TABLE IF NOT EXISTS). */
export async function ensureYjsDocSchema(db) {
  await db.query(await fs.promises.readFile(SCHEMA_SQL_PATH, 'utf8'));
}

export function createYDocStore(db, options = {}) {
  const debounceMs = options.debounceMs ?? YDOC_SAVE_DEBOUNCE_MS;
  const pending = new Map();

  async function writeNow(workspaceId, bytes) {
    await db.query(UPSERT_YDOC_SQL, [workspaceId, bytes, SCHEMA_VERSION]);
    log.debug('yjs doc persisted', { workspaceId, bytes: bytes.length });
  }

  function scheduleSave(workspaceId, docOrUpdate) {
    assertWorkspaceId(workspaceId);
    const bytes = toBytes(docOrUpdate);
    const prev = pending.get(workspaceId);
    if (prev) clearTimeout(prev.timer);
    const timer = setTimeout(() => {
      pending.delete(workspaceId);
      writeNow(workspaceId, bytes).catch((error) => {
        log.error('yjs doc debounced save failed', { workspaceId, error: error.message });
      });
    }, debounceMs);
    if (typeof timer.unref === 'function') timer.unref();
    pending.set(workspaceId, { bytes, timer });
  }

  async function saveNow(workspaceId, docOrUpdate) {
    assertWorkspaceId(workspaceId);
    const prev = pending.get(workspaceId);
    if (prev) {
      clearTimeout(prev.timer);
      pending.delete(workspaceId);
    }
    await writeNow(workspaceId, toBytes(docOrUpdate));
  }

  async function flush() {
    const writes = [...pending.entries()].map(([workspaceId, entry]) => {
      clearTimeout(entry.timer);
      pending.delete(workspaceId);
      return writeNow(workspaceId, entry.bytes);
    });
    await Promise.all(writes);
  }

  async function load(workspaceId) {
    assertWorkspaceId(workspaceId);
    const result = await db.query(SELECT_YDOC_SQL, [workspaceId]);
    const row = result.rows[0];
    if (!row) return null;
    if (Number(row.schema_version) !== SCHEMA_VERSION) {
      log.warn('yjs doc schema mismatch; treating as needs-reseed', {
        workspaceId,
        stored: row.schema_version,
        expected: SCHEMA_VERSION,
      });
      return null;
    }
    return decodeDocUpdate(row.yupdate);
  }

  return {
    scheduleSave,
    saveNow,
    flush,
    load,
    pendingCount: () => pending.size,
  };
}
