// server/collab/yStore.js
//
// Postgres storage for the compacted base of each workspace's Yjs document.
//
// The board itself lives in the update log (yUpdateLog.js). One row per
// workspace in workspace_yjs_docs holds every update up to compacted_seq
// folded into a single encoded Y update; the board is that base plus every
// log row after compacted_seq. Only compaction writes the base, and the write
// is guarded so an older compaction can never replace a newer one (two server
// processes sharing a room through Redis may both try).
//
// Reads return null bytes when no row exists or the stored schema_version
// differs from SCHEMA_VERSION. A mismatch is logged and treated as "needs
// reseed", never thrown, so boot never crashes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Y from 'yjs';
import { ID_PATTERN, SCHEMA_VERSION } from './ySchema.js';
import { createLogger } from '../logger.js';

const log = createLogger('yjs-persist');

export const YDOC_TABLE = 'workspace_yjs_docs';
export const YUPDATE_TABLE = 'workspace_yjs_updates';

const WRITE_BASE_SQL = `INSERT INTO ${YDOC_TABLE} (workspace_id, yupdate, schema_version, compacted_seq, updated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (workspace_id) DO UPDATE SET
  yupdate = EXCLUDED.yupdate,
  schema_version = EXCLUDED.schema_version,
  compacted_seq = EXCLUDED.compacted_seq,
  updated_at = NOW()
WHERE ${YDOC_TABLE}.compacted_seq <= EXCLUDED.compacted_seq
RETURNING compacted_seq`;

const SELECT_BASE_SQL = `SELECT workspace_id, yupdate, schema_version, compacted_seq, updated_at
FROM ${YDOC_TABLE} WHERE workspace_id = $1`;

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATHS = [
  path.resolve(here, '../../docker/045-workspace-yjs-docs.sql'),
  path.resolve(here, '../../docker/049-workspace-yjs-updates.sql'),
];

export function assertWorkspaceId(workspaceId) {
  if (!ID_PATTERN.test(String(workspaceId ?? ''))) {
    throw new Error(`yjs-persist: invalid workspaceId ${String(workspaceId)}`);
  }
}

/** Y.Doc -> Buffer (BYTEA-ready). Accepts a Y.Doc or a raw update. */
export function encodeDocUpdate(docOrUpdate) {
  if (docOrUpdate instanceof Y.Doc) return Buffer.from(Y.encodeStateAsUpdate(docOrUpdate));
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(docOrUpdate)) return docOrUpdate;
  if (docOrUpdate instanceof Uint8Array) return Buffer.from(docOrUpdate);
  throw new Error('yjs-persist: save needs a Y.Doc or Uint8Array update');
}

/** BYTEA column value (Buffer) -> Uint8Array for Y.applyUpdate. */
export function decodeDocUpdate(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Idempotent table bootstrap (CREATE TABLE / ADD COLUMN IF NOT EXISTS). */
export async function ensureYjsDocSchema(db) {
  for (const file of SCHEMA_SQL_PATHS) {
    await db.query(await fs.promises.readFile(file, 'utf8'));
  }
}

export function createYDocStore(db) {
  /** -> { update: Uint8Array | null, compactedSeq: number } */
  async function loadBase(workspaceId) {
    assertWorkspaceId(workspaceId);
    const result = await db.query(SELECT_BASE_SQL, [workspaceId]);
    const row = result.rows[0];
    if (!row) return { update: null, compactedSeq: 0 };
    const compactedSeq = Number(row.compacted_seq ?? 0);
    if (Number(row.schema_version) !== SCHEMA_VERSION) {
      log.warn('yjs doc schema mismatch; treating as needs-reseed', {
        workspaceId,
        stored: row.schema_version,
        expected: SCHEMA_VERSION,
      });
      return { update: null, compactedSeq };
    }
    return { update: decodeDocUpdate(row.yupdate), compactedSeq };
  }

  /** Replace the base unless a newer compaction already landed. -> boolean */
  async function writeBase(workspaceId, docOrUpdate, compactedSeq = 0) {
    assertWorkspaceId(workspaceId);
    const bytes = encodeDocUpdate(docOrUpdate);
    const result = await db.query(WRITE_BASE_SQL, [workspaceId, bytes, SCHEMA_VERSION, compactedSeq]);
    const written = (result.rowCount ?? result.rows.length) > 0;
    log.debug('yjs base written', { workspaceId, bytes: bytes.length, compactedSeq, written });
    return written;
  }

  return { loadBase, writeBase };
}
