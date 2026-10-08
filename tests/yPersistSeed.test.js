import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { SCHEMA_VERSION } from '../server/collab/ySchema.js';
import { docToSnapshot, snapshotToDoc } from '../server/collab/seedFromSnapshot.js';
import { YDOC_SAVE_DEBOUNCE_MS, YDOC_TABLE, createYDocStore } from '../server/collab/yStore.js';
import { createYjsPersistence, flushYjsStores } from '../server/collab/yPersistence.js';

// Representative revision snapshot: 2 windows (one doc window), a group,
// 2 strokes, 1 link, dock config.
function buildSnapshotFixture() {
  return {
    wins: [
      {
        id: 'win-1', x: 10, y: 20, w: 320, h: 240, kind: 'note', title: 'Plan',
        data: { pinned: true, tags: ['a', 'b'] },
      },
      {
        id: 'doc-1', x: 400, y: 60, w: 480, h: 360, kind: 'doc', title: 'Spec',
        text: 'hello world', data: { format: 'markdown' },
      },
    ],
    canvasGroups: [{ id: 'g-1', title: 'Agents', x: 0, y: 0, windowIds: ['win-1'] }],
    paths: [
      { id: 's-1', color: '#60A5FA', size: 4, points: [[0, 0], [10, 10], [20, 5]] },
      { id: 's-2', color: '#F87171', size: 2, points: [[5, 5], [15, 25]] },
    ],
    links: [{ id: 'l-1', fromId: 'win-1', toId: 'doc-1' }],
    dock: { visible: true, groupOverrides: { 'core-team': { visible: true } } },
  };
}

// Mocked pool at the query layer: captures the upserted row in memory and
// serves it back on SELECT. Y encode/decode stays real.
function memoryDb() {
  let row = null;
  const db = {
    query: jest.fn(async (sql, params) => {
      if (sql.includes(`INSERT INTO ${YDOC_TABLE}`)) {
        row = { workspace_id: params[0], yupdate: params[1], schema_version: params[2] };
        return { rows: [] };
      }
      if (sql.includes(`FROM ${YDOC_TABLE}`)) {
        return { rows: row ? [{ ...row }] : [] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    }),
    __getRow: () => row,
    __setRow: (next) => { row = next; },
  };
  return db;
}

test('snapshot -> doc -> snapshot round-trips deep-equal modulo meta', () => {
  const fixture = buildSnapshotFixture();
  const doc = snapshotToDoc(fixture, { seededFrom: 7, updatedAt: '2026-09-10T00:00:00.000Z' });
  const back = docToSnapshot(doc);
  expect(back.wins).toEqual(fixture.wins);
  expect(back.canvasGroups).toEqual(fixture.canvasGroups);
  expect(back.paths).toEqual(fixture.paths);
  expect(back.links).toEqual(fixture.links);
  expect(back.dock).toEqual(fixture.dock);
  expect(back.meta).toMatchObject({ schemaVersion: SCHEMA_VERSION, seededFrom: 7 });
});

test('yStore save -> load is byte-identical (mocked pool, real Y codec)', async () => {
  const db = memoryDb();
  const store = createYDocStore(db);
  const docA = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 3 });

  await store.saveNow('workspace-a', docA);

  expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining(`INSERT INTO ${YDOC_TABLE}`),
    ['workspace-a', expect.any(Buffer), SCHEMA_VERSION],
  );
  expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (workspace_id)');

  const loaded = await store.load('workspace-a');
  expect(Buffer.from(loaded)).toEqual(db.__getRow().yupdate);

  const docB = new Y.Doc();
  Y.applyUpdate(docB, loaded);
  expect(Y.encodeStateAsUpdate(docB)).toEqual(Y.encodeStateAsUpdate(docA));
});

test('yStore load resolves null on missing rows and schema mismatch', async () => {
  const db = memoryDb();
  const store = createYDocStore(db);
  await expect(store.load('workspace-a')).resolves.toBeNull();

  const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
  await store.saveNow('workspace-a', doc);
  db.__setRow({ ...db.__getRow(), schema_version: SCHEMA_VERSION + 1 });
  await expect(store.load('workspace-a')).resolves.toBeNull();
});

test('N rapid saves collapse to at most 2 DB writes', async () => {
  jest.useFakeTimers();
  try {
    const db = memoryDb();
    const store = createYDocStore(db);
    const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
    for (let i = 0; i < 5; i += 1) store.scheduleSave('workspace-a', doc);
    expect(db.query).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(YDOC_SAVE_DEBOUNCE_MS + 100);
    expect(db.query.mock.calls.length).toBeLessThanOrEqual(2);
  } finally {
    jest.useRealTimers();
  }
});

test('flushYjsStores writes pending saves without waiting for debounce', async () => {
  const db = memoryDb();
  const store = createYDocStore(db, { debounceMs: 60_000 });
  createYjsPersistence({ db, store });
  const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
  store.scheduleSave('workspace-a', doc);
  expect(db.query).not.toHaveBeenCalled();
  await flushYjsStores();
  expect(db.query).toHaveBeenCalledTimes(1);
});
