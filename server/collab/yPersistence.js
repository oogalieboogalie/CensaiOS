// server/collab/yPersistence.js
//
// Phase 2 wiring: the Hocuspocus persistence extension (extension-database
// pattern). Owns the load-or-seed path for onLoadDocument and the debounced
// save path for onStoreDocument. hocuspocus.js only mounts it — all logic
// lives here so that file stays a thin auth/gating skeleton.
//
// Load order per workspace (documentName == workspaceId):
//   1. workspace_yjs_docs row -> apply update (schema_version must match).
//   2. else latest revision snapshot (workspace_client_state) -> seed via
//      snapshotToDoc, then schedule a save so the seed persists.
//   3. else an empty doc (first-ever open; later writes will populate it).
// Every step fails soft (log + continue) — persistence must never crash
// boot or reject a connection. The table is bootstrapped lazily
// (ensureYjsDocSchema, idempotent) so no server/boot change is needed.

import * as Y from 'yjs';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { WORKSPACE_STATE_KEY, getWorkspaceState } from '../state/clientStateStore.js';
import { snapshotToDoc } from './seedFromSnapshot.js';
import { createYDocStore, ensureYjsDocSchema } from './yStore.js';

const log = createLogger('yjs-persist');

// Registry of live stores so process shutdown can flush debounced writes.
// Instances are server-lifetime (one per Hocuspocus server), so entries are
// never removed; test processes create a handful at most.
const openStores = new Set();
let shutdownHookInstalled = false;

export async function flushYjsStores() {
  await Promise.all([...openStores].map((store) => store.flush().catch((error) => {
    log.warn('yjs shutdown flush failed', { error: error.message });
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
    log.warn('revision snapshot lookup failed', { workspaceId, error: error.message });
    return null;
  }
}

export function createYjsPersistence(options = {}) {
  const db = options.db ?? pool;
  const store = options.store ?? createYDocStore(db, options.storeOptions);
  const loadSnapshot = options.loadSnapshot
    ?? ((workspaceId) => defaultLoadSnapshot(db, workspaceId));
  openStores.add(store);
  installShutdownFlush();
  let schemaReady = null;
  const ensureSchema = () => {
    if (!schemaReady) {
      schemaReady = ensureYjsDocSchema(db).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    return schemaReady;
  };

  async function onLoadDocument({ document, documentName }) {
    const workspaceId = String(documentName ?? '');
    try {
      await ensureSchema();
      const update = await store.load(workspaceId);
      if (update) {
        Y.applyUpdate(document, update);
        log.info('yjs doc loaded from postgres', { workspaceId, bytes: update.length });
        return;
      }
    } catch (error) {
      log.warn('yjs doc load failed; trying snapshot seed', { workspaceId, error: error.message });
    }
    try {
      const snapshot = await loadSnapshot(workspaceId);
      if (!snapshot) return;
      const seed = snapshotToDoc(snapshot.value ?? snapshot, {
        seededFrom: snapshot.revision ?? 'snapshot',
      });
      Y.applyUpdate(document, Y.encodeStateAsUpdate(seed));
      log.info('yjs doc seeded from revision snapshot', {
        workspaceId,
        seededFrom: snapshot.revision ?? 'snapshot',
      });
      store.scheduleSave(workspaceId, document);
    } catch (error) {
      log.warn('yjs doc seed failed; starting empty', { workspaceId, error: error.message });
    }
  }

  async function onStoreDocument({ document, documentName }) {
    const workspaceId = String(documentName ?? '');
    try {
      await ensureSchema();
      store.scheduleSave(workspaceId, document);
    } catch (error) {
      log.warn('yjs doc store failed', { workspaceId, error: error.message });
    }
  }

  return {
    extensionName: 'yjs-postgres-persistence',
    onLoadDocument,
    onStoreDocument,
    store,
  };
}
