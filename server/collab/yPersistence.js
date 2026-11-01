// server/collab/yPersistence.js
//
// The Hocuspocus persistence extension. The workspace's Yjs document is the
// only source of truth for the canvas; this file keeps it durable.
//
// Load order per workspace (documentName == workspaceId):
//   1. compacted base + update log (yUpdateLog.js) -> apply.
//   2. else the older revision snapshot (workspace_client_state): a board
//      that predates the shared doc is migrated into it on first open, and
//      the migration is written to the log right away.
//   3. else an empty doc (first-ever open; the first browser seeds it).
//
// Every change is appended to the log (onChange). The store hook (debounced
// by Hocuspocus) writes queued log rows, refreshes the snapshot row's canvas
// fields as a backup copy, and compacts old log rows now and then. Every step
// fails soft (log + continue): persistence must never crash boot or reject a
// connection. Tables are bootstrapped lazily (idempotent).

import * as Y from 'yjs';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { WORKSPACE_STATE_KEY, getWorkspaceState } from '../state/clientStateStore.js';
import { writeCanvasBackup } from './canvasSnapshot.js';
import { snapshotToDoc } from './seedFromSnapshot.js';
import { createYUpdateLog } from './yUpdateLog.js';
import { ensureYjsDocSchema } from './yStore.js';

const log = createLogger('yjs-persist');

// Compact a workspace after this many store passes, or on load when the log
// already holds more rows than this.
export const COMPACT_EVERY_STORES = 200;
export const COMPACT_ON_LOAD_ROWS = 500;

// Live logs so process shutdown can flush queued rows. Instances are
// server-lifetime (one per Hocuspocus server), so entries are never removed.
const openLogs = new Set();
let shutdownHookInstalled = false;

export async function flushYjsStores() {
  await Promise.all([...openLogs].map((updateLog) => updateLog.flush().catch((error) => {
    log.warn('yjs shutdown flush failed', { code: safeErrorCode(error) });
  })));
}

function installShutdownFlush() {
  if (shutdownHookInstalled || process.env.NODE_ENV === 'test') return;
  shutdownHookInstalled = true;
  const flushAll = () => { flushYjsStores().catch(() => {}); };
  process.once('SIGTERM', flushAll);
  process.once('SIGINT', flushAll);
}

async function defaultLoadSnapshot(db, workspaceId) {
  try {
    const state = await getWorkspaceState({ db, workspaceId, key: WORKSPACE_STATE_KEY });
    if (!state.found || !state.value) return null;
    return { value: state.value, revision: state.revision };
  } catch (error) {
    log.warn('revision snapshot lookup failed', { workspaceId, code: safeErrorCode(error) });
    return null;
  }
}

/** Who made a change, for the log's actor column. */
export function actorForChange({ context, transactionOrigin } = {}) {
  if (typeof context?.actor === 'string' && context.actor) return context.actor.slice(0, 128);
  if (context?.userId) return `user:${String(context.userId).slice(0, 64)}`;
  if (context?.guestId) return `guest:${String(context.guestId).slice(0, 64)}`;
  if (context?.serverWriter || transactionOrigin?.source === 'local') return 'server';
  return null;
}

export function createYjsPersistence(options = {}) {
  const db = options.db ?? pool;
  const updateLog = options.log ?? createYUpdateLog(db, options.logOptions);
  const loadSnapshot = options.loadSnapshot
    ?? ((workspaceId) => defaultLoadSnapshot(db, workspaceId));
  const backup = options.backup ?? ((workspaceId, doc) => writeCanvasBackup(db, workspaceId, doc));
  const storesSinceCompact = new Map();
  openLogs.add(updateLog);
  installShutdownFlush();
  let schemaReady = null;
  const ensureSchema = options.ensureSchema ?? (() => {
    if (!schemaReady) {
      schemaReady = ensureYjsDocSchema(db).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    return schemaReady;
  });

  const compactSoon = (workspaceId) => {
    storesSinceCompact.set(workspaceId, 0);
    updateLog.compact(workspaceId).catch((error) => {
      log.warn('yjs log compaction failed', { workspaceId, code: safeErrorCode(error) });
    });
  };

  async function migrateFromSnapshot(document, workspaceId) {
    const snapshot = await loadSnapshot(workspaceId);
    if (!snapshot) return;
    const seed = snapshotToDoc(snapshot.value ?? snapshot, {
      seededFrom: snapshot.revision ?? 'snapshot',
    });
    Y.applyUpdate(document, Y.encodeStateAsUpdate(seed));
    seed.destroy();
    updateLog.append(workspaceId, Y.encodeStateAsUpdate(document), { actor: 'migration' });
    await updateLog.flush(workspaceId);
    log.info('board migrated from revision snapshot into the shared doc', {
      workspaceId,
      seededFrom: snapshot.revision ?? 'snapshot',
    });
  }

  async function onLoadDocument({ document, documentName }) {
    const workspaceId = String(documentName ?? '');
    try {
      await ensureSchema();
      const loaded = await updateLog.load(workspaceId);
      if (loaded) {
        Y.applyUpdate(document, loaded.update);
        log.info('yjs doc loaded', { workspaceId, rows: loaded.rows, bytes: loaded.update.length });
        if (loaded.rows > COMPACT_ON_LOAD_ROWS) compactSoon(workspaceId);
        return;
      }
    } catch (error) {
      log.warn('yjs doc load failed; trying snapshot migration', { workspaceId, code: safeErrorCode(error) });
    }
    try {
      await migrateFromSnapshot(document, workspaceId);
    } catch (error) {
      log.warn('yjs snapshot migration failed; starting empty', { workspaceId, code: safeErrorCode(error) });
    }
  }

  function onChange(payload) {
    // Updates relayed from another server process through Redis were logged
    // by the process that received them.
    if (payload.transactionOrigin?.source === 'redis') return;
    try {
      updateLog.append(String(payload.documentName ?? ''), payload.update, { actor: actorForChange(payload) });
    } catch (error) {
      log.warn('yjs update not logged', { workspaceId: payload.documentName, code: safeErrorCode(error) });
    }
  }

  async function onStoreDocument({ document, documentName }) {
    const workspaceId = String(documentName ?? '');
    try {
      await ensureSchema();
      await updateLog.flush(workspaceId);
      await backup(workspaceId, document);
      const stores = (storesSinceCompact.get(workspaceId) ?? 0) + 1;
      storesSinceCompact.set(workspaceId, stores);
      if (stores >= COMPACT_EVERY_STORES) compactSoon(workspaceId);
    } catch (error) {
      log.warn('yjs doc store failed', { workspaceId, code: safeErrorCode(error) });
    }
  }

  async function afterUnloadDocument({ documentName }) {
    await updateLog.flush(String(documentName ?? '')).catch(() => {});
  }

  return {
    extensionName: 'yjs-postgres-persistence',
    onLoadDocument,
    onChange,
    onStoreDocument,
    afterUnloadDocument,
    updateLog,
  };
}
