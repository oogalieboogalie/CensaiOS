// Downloads OSV data into the local mirror: a full archive import the first
// time, then incremental updates from OSV's modified_id.csv change list.
import { Unzip, UnzipInflate, strFromU8 } from 'fflate';
import { createLogger } from '../logger.js';
import { osvEcosystem } from './match.js';
import { ensureOsvSchema, getSyncState, recordSync, upsertVulnerabilities } from './store.js';

const log = createLogger('osv-mirror');
const BATCH_SIZE = 500;
// Past this many changed records an incremental pass is slower than a re-import.
const MAX_INCREMENTAL = 3000;
const FETCH_CONCURRENCY = 8;

export function osvBaseUrl(env = process.env) {
  return String(env.OSV_MIRROR_BASE_URL || 'https://osv-vulnerabilities.storage.googleapis.com').replace(/\/+$/, '');
}

function concatBytes(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

async function fetchOk(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`OSV download failed: ${response.status} ${url}`);
  return response;
}

/** Stream-import every record in `{ecosystem}/all.zip`. Returns count and newest `modified`. */
export async function importArchive(db, ecosystem, { fetchImpl = fetch, baseUrl = osvBaseUrl() } = {}) {
  const eco = osvEcosystem(ecosystem);
  const response = await fetchOk(fetchImpl, `${baseUrl}/${encodeURIComponent(eco)}/all.zip`);
  let pending = [];
  let total = 0;
  let newest = null;
  let parseError = null;
  const unzip = new Unzip((file) => {
    if (!file.name.endsWith('.json')) return;
    const chunks = [];
    file.ondata = (err, data, final) => {
      if (err) { parseError = err; return; }
      chunks.push(data);
      if (!final) return;
      try {
        const record = JSON.parse(strFromU8(chunks.length === 1 ? chunks[0] : concatBytes(chunks)));
        pending.push(record);
        if (record.modified && (!newest || Date.parse(record.modified) > Date.parse(newest))) newest = record.modified;
      } catch (e) { log.warn('skipping unparseable OSV record', { file: file.name, error: e.message }); }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  const flush = async () => {
    if (!pending.length) return;
    const batch = pending;
    pending = [];
    total += await upsertVulnerabilities(db, batch);
  };
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    unzip.push(value || new Uint8Array(0), done);
    if (parseError) throw parseError;
    while (pending.length >= BATCH_SIZE) {
      const batch = pending.splice(0, BATCH_SIZE);
      total += await upsertVulnerabilities(db, batch);
    }
    if (done) break;
  }
  await flush();
  return { count: total, newest };
}

/** Parse modified_id.csv ("<iso time>,<id>", newest first) down to entries newer than `since`. */
export function changedSince(csv, since) {
  const cutoff = since instanceof Date ? since.getTime() : (since ? Date.parse(since) : null);
  const changed = [];
  for (const line of String(csv).split('\n')) {
    const comma = line.indexOf(',');
    if (comma < 1) continue;
    const modified = line.slice(0, comma).trim();
    const id = line.slice(comma + 1).trim();
    if (!id) continue;
    if (cutoff !== null && Date.parse(modified) <= cutoff) break;
    changed.push({ id, modified });
  }
  return changed;
}

async function importChanged(db, eco, changed, { fetchImpl, baseUrl }) {
  let count = 0;
  for (let i = 0; i < changed.length; i += BATCH_SIZE) {
    const slice = changed.slice(i, i + BATCH_SIZE);
    const records = [];
    for (let j = 0; j < slice.length; j += FETCH_CONCURRENCY) {
      const group = slice.slice(j, j + FETCH_CONCURRENCY);
      const fetched = await Promise.all(group.map(async ({ id }) => {
        const res = await fetchOk(fetchImpl, `${baseUrl}/${encodeURIComponent(eco)}/${encodeURIComponent(id)}.json`);
        return res.json();
      }));
      records.push(...fetched);
    }
    count += await upsertVulnerabilities(db, records);
  }
  return count;
}

/**
 * Bring one ecosystem's mirror up to date. Full import when empty or far
 * behind; otherwise fetch only the records OSV changed since the last sync.
 */
export async function syncEcosystem(db, ecosystem, { fetchImpl = fetch, baseUrl = osvBaseUrl(), forceFull = false } = {}) {
  const eco = osvEcosystem(ecosystem);
  await ensureOsvSchema(db);
  const started = Date.now();
  try {
    const state = await getSyncState(db, eco);
    let changed = null;
    if (!forceFull && state?.last_modified) {
      const csv = await (await fetchOk(fetchImpl, `${baseUrl}/${encodeURIComponent(eco)}/modified_id.csv`)).text();
      changed = changedSince(csv, state.last_modified);
    }
    let result;
    if (changed && changed.length <= MAX_INCREMENTAL) {
      const count = await importChanged(db, eco, changed, { fetchImpl, baseUrl });
      result = { mode: 'incremental', count, newest: changed[0]?.modified || null };
    } else {
      result = { mode: 'full', ...(await importArchive(db, eco, { fetchImpl, baseUrl })) };
    }
    await recordSync(db, eco, { lastModified: result.newest, full: result.mode === 'full' });
    log.info('OSV mirror synced', { ecosystem: eco, ...result, ms: Date.now() - started });
    return { ecosystem: eco, ...result };
  } catch (err) {
    log.warn('OSV mirror sync failed', { ecosystem: eco, error: err.message });
    await recordSync(db, eco, { error: err.message }).catch(() => {});
    throw err;
  }
}
