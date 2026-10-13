import { jest } from '@jest/globals';
import { strToU8, zipSync } from 'fflate';
import { DOMPURIFY_WINDOW, LODASH_COMMAND_INJECTION } from './fixtures/osvRecords.js';

const stored = new Map();
let syncState = null;
const upsertVulnerabilities = jest.fn(async (_db, records) => {
  for (const r of records) stored.set(r.id, r);
  return records.length;
});
const recordSync = jest.fn(async (_db, _eco, { lastModified, full }) => {
  syncState = { last_modified: lastModified ?? syncState?.last_modified, last_sync_at: new Date(), full };
});

jest.unstable_mockModule('../server/osvMirror/store.js', () => ({
  ensureOsvSchema: jest.fn(async () => {}),
  getSyncState: jest.fn(async () => syncState),
  recordSync,
  upsertVulnerabilities,
}));

const { changedSince, syncEcosystem } = await import('../server/osvMirror/sync.js');

const BASE = 'https://osv.test';
function fakeFetch(files) {
  return jest.fn(async (url) => {
    const body = files[url];
    if (body === undefined) return new Response('missing', { status: 404 });
    return new Response(body);
  });
}

describe('OSV mirror sync', () => {
  beforeEach(() => { stored.clear(); syncState = null; jest.clearAllMocks(); });

  test('first sync imports the full archive and records the newest modified time', async () => {
    const zip = zipSync({
      [`${LODASH_COMMAND_INJECTION.id}.json`]: strToU8(JSON.stringify(LODASH_COMMAND_INJECTION)),
      [`${DOMPURIFY_WINDOW.id}.json`]: strToU8(JSON.stringify(DOMPURIFY_WINDOW)),
    });
    const fetchImpl = fakeFetch({ [`${BASE}/npm/all.zip`]: zip });

    const result = await syncEcosystem({}, 'npm', { fetchImpl, baseUrl: BASE });

    expect(result).toEqual(expect.objectContaining({ mode: 'full', count: 2, newest: DOMPURIFY_WINDOW.modified }));
    expect([...stored.keys()].sort()).toEqual([DOMPURIFY_WINDOW.id, LODASH_COMMAND_INJECTION.id].sort());
    expect(recordSync).toHaveBeenCalledWith({}, 'npm', { lastModified: DOMPURIFY_WINDOW.modified, full: true });
  });

  test('later syncs fetch only records changed since the last sync', async () => {
    syncState = { last_modified: new Date('2026-10-01T00:00:00Z'), last_sync_at: new Date() };
    const updated = { ...DOMPURIFY_WINDOW, modified: '2026-10-03T05:30:03.679714841Z' };
    const fetchImpl = fakeFetch({
      [`${BASE}/npm/modified_id.csv`]: `${updated.modified},${updated.id}\n2026-09-10T03:49:04Z,${LODASH_COMMAND_INJECTION.id}\n`,
      [`${BASE}/npm/${updated.id}.json`]: JSON.stringify(updated),
    });

    const result = await syncEcosystem({}, 'npm', { fetchImpl, baseUrl: BASE });

    expect(result).toEqual(expect.objectContaining({ mode: 'incremental', count: 1, newest: updated.modified }));
    expect(fetchImpl).not.toHaveBeenCalledWith(`${BASE}/npm/all.zip`);
    expect(stored.get(updated.id)).toEqual(updated);
  });

  test('changedSince stops at the cutoff, including sub-millisecond timestamps', () => {
    const csv = '2026-10-03T05:30:03.679714841Z,A\n2026-10-02T00:00:00Z,B\n2026-09-01T00:00:00Z,C\n';
    expect(changedSince(csv, null).map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(changedSince(csv, '2026-10-01T00:00:00Z').map((c) => c.id)).toEqual(['A', 'B']);
    // Postgres hands back a Date with microseconds trimmed: A is already synced.
    expect(changedSince(csv, new Date('2026-10-03T05:30:03.679Z')).map((c) => c.id)).toEqual([]);
  });
});
