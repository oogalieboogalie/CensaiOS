// Postgres persistence for the OSV mirror.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { affectedPackages, affectsVersion, osvEcosystem } from './match.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SQL_PATH = path.resolve(here, '../../docker/047-osv-mirror.sql');

let schemaReady = null;

export function ensureOsvSchema(db) {
  if (!schemaReady) {
    schemaReady = fs.promises.readFile(SQL_PATH, 'utf8')
      .then((sql) => db.query(sql))
      .catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

function toTimestamp(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** Upsert a batch of OSV records and re-index their affected packages. */
export async function upsertVulnerabilities(db, records) {
  const rows = records.filter((r) => r && typeof r.id === 'string');
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.id);
  await db.query(
    `INSERT INTO osv_vulnerabilities (id, modified, withdrawn, summary, data, synced_at)
     SELECT * , NOW() FROM UNNEST($1::text[], $2::timestamptz[], $3::timestamptz[], $4::text[], $5::jsonb[])
     ON CONFLICT (id) DO UPDATE SET
       modified = EXCLUDED.modified, withdrawn = EXCLUDED.withdrawn,
       summary = EXCLUDED.summary, data = EXCLUDED.data, synced_at = NOW()`,
    [
      ids,
      rows.map((r) => toTimestamp(r.modified)),
      rows.map((r) => toTimestamp(r.withdrawn)),
      rows.map((r) => (r.summary ? String(r.summary).slice(0, 2000) : null)),
      rows.map((r) => JSON.stringify(r)),
    ],
  );
  const eco = [];
  const pkg = [];
  const vid = [];
  for (const record of rows) {
    for (const { ecosystem, name } of affectedPackages(record)) {
      eco.push(ecosystem); pkg.push(name); vid.push(record.id);
    }
  }
  await db.query('DELETE FROM osv_affected_packages WHERE vuln_id = ANY($1::text[])', [ids]);
  if (vid.length) {
    await db.query(
      `INSERT INTO osv_affected_packages (ecosystem, package, vuln_id)
       SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[]) ON CONFLICT DO NOTHING`,
      [eco, pkg, vid],
    );
  }
  return rows.length;
}

export async function getSyncState(db, ecosystem) {
  const { rows } = await db.query('SELECT * FROM osv_sync_state WHERE ecosystem = $1', [osvEcosystem(ecosystem)]);
  return rows[0] || null;
}

export async function recordSync(db, ecosystem, { lastModified = null, full = false, error = null } = {}) {
  const eco = osvEcosystem(ecosystem);
  await db.query(
    `INSERT INTO osv_sync_state (ecosystem, last_modified, last_full_sync_at, last_sync_at, last_error, record_count, updated_at)
     VALUES ($1, $2, CASE WHEN $3 THEN NOW() END, CASE WHEN $4::text IS NULL THEN NOW() END, $4,
             (SELECT COUNT(DISTINCT vuln_id) FROM osv_affected_packages WHERE ecosystem = $1), NOW())
     ON CONFLICT (ecosystem) DO UPDATE SET
       last_modified = COALESCE(EXCLUDED.last_modified, osv_sync_state.last_modified),
       last_full_sync_at = COALESCE(EXCLUDED.last_full_sync_at, osv_sync_state.last_full_sync_at),
       last_sync_at = COALESCE(EXCLUDED.last_sync_at, osv_sync_state.last_sync_at),
       last_error = EXCLUDED.last_error,
       record_count = EXCLUDED.record_count,
       updated_at = NOW()`,
    [eco, lastModified, full, error],
  );
}

/** True once at least one successful sync has populated this ecosystem. */
export async function isMirrorReady(db, ecosystem) {
  const state = await getSyncState(db, ecosystem);
  return Boolean(state?.last_sync_at);
}

/** Vulnerabilities from the mirror that affect `name@version`. */
export async function findVulnerabilities(db, { ecosystem, name, version }) {
  const eco = osvEcosystem(ecosystem);
  const { rows } = await db.query(
    `SELECT v.data FROM osv_affected_packages a
       JOIN osv_vulnerabilities v ON v.id = a.vuln_id
      WHERE a.ecosystem = $1 AND a.package = $2 AND v.withdrawn IS NULL`,
    [eco, name],
  );
  return rows.map((r) => r.data).filter((vuln) => affectsVersion(vuln, { ecosystem: eco, name, version }));
}

export function __resetSchemaForTests() { schemaReady = null; }
