import { jest } from '@jest/globals';
import * as Y from 'yjs';
import { SCHEMA_VERSION } from '../server/collab/ySchema.js';
import { docToSnapshot, snapshotToDoc } from '../server/collab/seedFromSnapshot.js';
import { YDOC_TABLE, YUPDATE_TABLE, createYDocStore } from '../server/collab/yStore.js';
import { YLOG_BATCH_MS, createYUpdateLog } from '../server/collab/yUpdateLog.js';
import { createYjsPersistence, flushYjsStores } from '../server/collab/yPersistence.js';
import { yjsMemoryDb as memoryDb } from './support/yjsMemoryDb.js';

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

test('yStore base write -> load is byte-identical (mocked pool, real Y codec)', async () => {
  const db = memoryDb();
  const store = createYDocStore(db);
  const docA = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 3 });

  await expect(store.writeBase('workspace-a', docA, 4)).resolves.toBe(true);

  expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining(`INSERT INTO ${YDOC_TABLE}`),
    ['workspace-a', expect.any(Buffer), SCHEMA_VERSION, 4],
  );
  expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (workspace_id)');

  const loaded = await store.loadBase('workspace-a');
  expect(loaded.compactedSeq).toBe(4);
  expect(Buffer.from(loaded.update)).toEqual(db.base().yupdate);

  const docB = new Y.Doc();
  Y.applyUpdate(docB, loaded.update);
  expect(Y.encodeStateAsUpdate(docB)).toEqual(Y.encodeStateAsUpdate(docA));
});

test('yStore base load resolves null bytes on missing rows and schema mismatch', async () => {
  const db = memoryDb();
  const store = createYDocStore(db);
  await expect(store.loadBase('workspace-a')).resolves.toEqual({ update: null, compactedSeq: 0 });

  const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
  await store.writeBase('workspace-a', doc, 2);
  db.setBase({ ...db.base(), schema_version: SCHEMA_VERSION + 1 });
  await expect(store.loadBase('workspace-a')).resolves.toEqual({ update: null, compactedSeq: 2 });
});

test('an older compaction never replaces a newer base', async () => {
  const db = memoryDb();
  const store = createYDocStore(db);
  const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
  await store.writeBase('workspace-a', doc, 10);
  await expect(store.writeBase('workspace-a', new Y.Doc(), 5)).resolves.toBe(false);
  expect((await store.loadBase('workspace-a')).compactedSeq).toBe(10);
});

test('N rapid updates from one person collapse into one log row', async () => {
  jest.useFakeTimers();
  try {
    const db = memoryDb();
    const updateLog = createYUpdateLog(db);
    const doc = new Y.Doc();
    doc.on('update', (update) => updateLog.append('workspace-a', update, { actor: 'user:1' }));
    for (let i = 0; i < 5; i += 1) doc.getMap('canvas').set(`k${i}`, i);
    expect(db.query).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(YLOG_BATCH_MS + 100);
    expect(updateLog.pendingCount()).toBe(0);
    await updateLog.flush('workspace-a'); // wait for the queued write to settle
    const inserts = db.query.mock.calls.filter(([sql]) => sql.includes(`INSERT INTO ${YUPDATE_TABLE}`));
    expect(inserts).toHaveLength(1);
    expect(db.rows()[0].actor).toBe('user:1');
  } finally {
    jest.useRealTimers();
  }
});

test('flushYjsStores writes queued log rows without waiting for the batch window', async () => {
  const db = memoryDb();
  const updateLog = createYUpdateLog(db, { batchMs: 60_000 });
  createYjsPersistence({ db, log: updateLog });
  const doc = snapshotToDoc(buildSnapshotFixture(), { seededFrom: 1 });
  updateLog.append('workspace-a', Y.encodeStateAsUpdate(doc));
  expect(db.query).not.toHaveBeenCalled();
  await flushYjsStores();
  expect(db.rows()).toHaveLength(1);
});
