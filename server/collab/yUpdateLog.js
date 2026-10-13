// server/collab/yUpdateLog.js
//
// Append-only update log for each workspace's Yjs document (the canvas).
//
// Every change becomes a row in workspace_yjs_updates. Bursts (a window drag
// emits an update per frame) are merged per workspace for YLOG_BATCH_MS
// before one INSERT, and rows are written one at a time per workspace so seq
// order matches the order updates arrived.
//
// The board = compacted base (yStore.js) + every row after compacted_seq.
// compact() folds only rows older than keepMs (and the oldest rows beyond
// maxRows) into the base, so recent history stays replayable: rebuild()
// returns the board as it stood at any seq still in the log.

import * as Y from 'yjs';
import { createLogger } from '../logger.js';
import { YUPDATE_TABLE, assertWorkspaceId, createYDocStore, decodeDocUpdate } from './yStore.js';

const log = createLogger('yjs-log');

export const YLOG_BATCH_MS = 250;
export const YLOG_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
export const YLOG_MAX_ROWS = 2000;

const INSERT_SQL = `INSERT INTO ${YUPDATE_TABLE} (workspace_id, yupdate, actor)
VALUES ($1, $2, $3) RETURNING seq`;
const SELECT_ROWS_SQL = `SELECT seq, yupdate, actor, created_at FROM ${YUPDATE_TABLE}
WHERE workspace_id = $1 AND seq > $2 ORDER BY seq`;
const DELETE_ROWS_SQL = `DELETE FROM ${YUPDATE_TABLE} WHERE workspace_id = $1 AND seq <= $2`;

function merged(updates) {
  return updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
}

export function createYUpdateLog(db, options = {}) {
  const batchMs = options.batchMs ?? YLOG_BATCH_MS;
  const keepMs = options.keepMs ?? YLOG_KEEP_MS;
  const maxRows = options.maxRows ?? YLOG_MAX_ROWS;
  const now = options.now ?? Date.now;
  const base = options.base ?? createYDocStore(db);
  const pending = new Map();
  const chains = new Map();

  // Serialize writes per workspace so seq order is arrival order.
  function enqueue(workspaceId, task) {
    const run = (chains.get(workspaceId) ?? Promise.resolve()).then(task);
    const settled = run.catch(() => {});
    chains.set(workspaceId, settled);
    settled.then(() => { if (chains.get(workspaceId) === settled) chains.delete(workspaceId); });
    return run;
  }

  function flushOne(workspaceId) {
    const entry = pending.get(workspaceId);
    if (!entry) return chains.get(workspaceId) ?? Promise.resolve();
    pending.delete(workspaceId);
    clearTimeout(entry.timer);
    const update = merged(entry.updates);
    return enqueue(workspaceId, async () => {
      const result = await db.query(INSERT_SQL, [workspaceId, Buffer.from(update), entry.actor]);
      return Number(result.rows[0]?.seq ?? 0);
    }).catch((error) => {
      log.error('yjs update append failed', { workspaceId, error: error.message });
    });
  }

  /** Queue one Yjs update for the log. Same-actor bursts merge into one row. */
  function append(workspaceId, update, { actor = null } = {}) {
    assertWorkspaceId(workspaceId);
    if (!(update instanceof Uint8Array) || update.length === 0) return;
    const current = pending.get(workspaceId);
    if (current && current.actor !== actor) flushOne(workspaceId);
    const entry = pending.get(workspaceId) ?? { updates: [], actor, timer: null };
    entry.updates.push(update);
    if (!entry.timer) {
      entry.timer = setTimeout(() => { flushOne(workspaceId); }, batchMs);
      if (typeof entry.timer.unref === 'function') entry.timer.unref();
    }
    pending.set(workspaceId, entry);
  }

  /** Write queued updates now (one workspace, or all). */
  async function flush(workspaceId = null) {
    const ids = workspaceId ? [workspaceId] : [...new Set([...pending.keys(), ...chains.keys()])];
    await Promise.all(ids.map((id) => flushOne(id)));
  }

  async function readRows(workspaceId, afterSeq) {
    const result = await db.query(SELECT_ROWS_SQL, [workspaceId, afterSeq]);
    return result.rows.map((row) => ({
      seq: Number(row.seq),
      update: decodeDocUpdate(row.yupdate),
      actor: row.actor ?? null,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    }));
  }

  /** Whole board as one update, or null when the workspace has no Yjs state yet. */
  async function load(workspaceId) {
    assertWorkspaceId(workspaceId);
    const { update: baseUpdate, compactedSeq } = await base.loadBase(workspaceId);
    const rows = await readRows(workspaceId, compactedSeq);
    const parts = [...(baseUpdate ? [baseUpdate] : []), ...rows.map((row) => row.update)];
    if (!parts.length) return null;
    return { update: merged(parts), rows: rows.length, lastSeq: rows.at(-1)?.seq ?? compactedSeq };
  }

  /**
   * The board as it stood after `untilSeq` (and/or at time `until`, ms).
   * Returns null when that point was already folded into the base.
   */
  async function rebuild(workspaceId, { untilSeq = Number.MAX_SAFE_INTEGER, until = null } = {}) {
    assertWorkspaceId(workspaceId);
    await flush(workspaceId);
    const { update: baseUpdate, compactedSeq } = await base.loadBase(workspaceId);
    if (untilSeq < compactedSeq) return null;
    const kept = await readRows(workspaceId, compactedSeq);
    // Earlier than every kept row while a base exists: that moment was folded.
    if (until !== null && compactedSeq > 0 && kept.length && kept[0].createdAt > until) return null;
    const rows = kept.filter((row) => row.seq <= untilSeq && (until === null || row.createdAt <= until));
    const doc = new Y.Doc();
    if (baseUpdate) Y.applyUpdate(doc, baseUpdate);
    for (const row of rows) Y.applyUpdate(doc, row.update);
    return doc;
  }

  /** Base + every kept row, for the history list. -> { baseUpdate, compactedSeq, rows } */
  async function entries(workspaceId) {
    assertWorkspaceId(workspaceId);
    await flush(workspaceId);
    const { update: baseUpdate, compactedSeq } = await base.loadBase(workspaceId);
    return { baseUpdate, compactedSeq, rows: await readRows(workspaceId, compactedSeq) };
  }

  /** Fold old rows into the base. -> { folded, compactedSeq } */
  async function compact(workspaceId) {
    assertWorkspaceId(workspaceId);
    await flush(workspaceId);
    const { update: baseUpdate, compactedSeq } = await base.loadBase(workspaceId);
    const rows = await readRows(workspaceId, compactedSeq);
    const cutoffTime = now() - keepMs;
    const firstRecent = rows.findIndex((row) => row.createdAt > cutoffTime);
    const foldCount = Math.max(firstRecent === -1 ? rows.length : firstRecent, rows.length - maxRows);
    if (foldCount <= 0) return { folded: 0, compactedSeq };
    const folded = rows.slice(0, foldCount);
    const doc = new Y.Doc();
    if (baseUpdate) Y.applyUpdate(doc, baseUpdate);
    for (const row of folded) Y.applyUpdate(doc, row.update);
    const cutoffSeq = folded.at(-1).seq;
    const written = await base.writeBase(workspaceId, doc, cutoffSeq);
    doc.destroy();
    if (!written) return { folded: 0, compactedSeq };
    await db.query(DELETE_ROWS_SQL, [workspaceId, cutoffSeq]);
    log.info('yjs log compacted', { workspaceId, folded: foldCount, compactedSeq: cutoffSeq });
    return { folded: foldCount, compactedSeq: cutoffSeq };
  }

  return {
    append,
    flush,
    load,
    rebuild,
    entries,
    compact,
    pendingCount: () => pending.size,
  };
}
