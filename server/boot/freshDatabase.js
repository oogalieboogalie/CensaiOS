// First start of the Docker install (docker compose up on a new computer).
//
// Postgres only runs the SQL files docker-compose.yml hands it on a brand-new
// volume, and the server's own boot code makes some more tables, but a few
// files in docker/ are applied by neither. On the PC those were applied by
// hand; a fresh `docker compose up` never got them. This runs once, before
// the server starts, and applies the rest the same way desktop-stack does for
// the laptop app. A database that already has accounts in it is never
// touched, so existing installs are left alone.
//
// Usage (docker/entrypoint.sh): node server/boot/freshDatabase.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..', '..');
const MARKER_TABLE = 'censai_fresh_install';

/** The SQL files docker-compose.yml hands Postgres on first start. */
export function composeInitSqlFiles(composeText) {
  const files = [];
  const re = /\.\/(docker\/[\w.-]+\.sql):\/docker-entrypoint-initdb\.d\/([\w.-]+\.sql)/g;
  for (const m of String(composeText).matchAll(re)) files.push(m[1]);
  return files;
}

/** Every SQL file in docker/ that Postgres did not already run, by name. */
export function remainingSqlFiles(composeText, allFiles) {
  const done = new Set(composeInitSqlFiles(composeText));
  return allFiles.filter((f) => !done.has(f)).sort();
}

/**
 * Applies files, retrying the ones that failed while each round makes
 * progress (a later file can depend on an earlier one). Returns what never
 * applied.
 */
export async function applySqlFiles(client, files, readFile) {
  let pending = [...files];
  for (;;) {
    const failed = [];
    for (const file of pending) {
      try {
        await client.query(await readFile(file));
      } catch {
        // A file with its own BEGIN leaves the transaction aborted.
        await client.query('ROLLBACK').catch(() => {});
        failed.push(file);
      }
    }
    if (failed.length === 0 || failed.length === pending.length) return failed;
    pending = failed;
  }
}

async function tableExists(client, name) {
  const res = await client.query('SELECT to_regclass($1) AS t', [`public.${name}`]);
  return Boolean(res.rows[0]?.t);
}

/** Fresh = never finished this step and nobody has signed in yet. */
export async function isFreshDatabase(client) {
  if (await tableExists(client, MARKER_TABLE)) return false;
  if (!(await tableExists(client, 'users'))) return true;
  const res = await client.query('SELECT COUNT(*)::int AS n FROM users');
  return (res.rows[0]?.n || 0) === 0;
}

async function ledgerLog() {
  const { createLogger } = await import(pathToFileURL(path.join(appRoot, 'server/logger.js')).href);
  return createLogger('db-setup');
}

export async function bootstrapFreshDatabase(client, { root = appRoot, log = console.log, ledgerLogger = null } = {}) {
  const { recordApplied, recordExisting } = await import(pathToFileURL(path.join(root, 'server/boot/setupLedger.js')).href);
  const dbLog = ledgerLogger || await ledgerLog();
  if (!(await isFreshDatabase(client))) {
    await recordExisting(client, { root, log: dbLog });
    return { skipped: true };
  }
  log('[censaiOS] First start: setting up the rest of the database...');
  const readFile = (file) => fs.promises.readFile(path.join(root, file), 'utf8');
  let composeText = '';
  try { composeText = await fs.promises.readFile(path.join(root, 'docker-compose.yml'), 'utf8'); } catch { /* none: apply all */ }
  const all = (await fs.promises.readdir(path.join(root, 'docker')))
    .filter((f) => f.endsWith('.sql'))
    .map((f) => `docker/${f}`);
  const remaining = remainingSqlFiles(composeText, all);
  const pending = await applySqlFiles(client, remaining, readFile);
  // Later files lean on the workspaces table the server makes at boot.
  const { ensureWorkspaceSchema } = await import(pathToFileURL(path.join(root, 'server/workspaces/schema.js')).href);
  await ensureWorkspaceSchema(client);
  const left = await applySqlFiles(client, pending, readFile);
  if (left.length) log(`[censaiOS] Left to the server at boot: ${left.join(', ')}`);
  const ran = [...composeInitSqlFiles(composeText), ...remaining].filter((f) => !left.includes(f));
  await recordApplied(client, { root, applied: ran, log: dbLog });
  await client.query(`CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (finished_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await client.query(`INSERT INTO ${MARKER_TABLE} DEFAULT VALUES`);
  log('[censaiOS] Database ready.');
  return { skipped: false, left };
}

async function main() {
  const { default: pg } = await import('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  // Postgres reports healthy a moment before it takes connections from
  // other containers; try for about a minute.
  let client;
  for (let attempt = 1; ; attempt++) {
    client = new pg.Client({ connectionString });
    try {
      await client.connect();
      break;
    } catch (err) {
      await client.end().catch(() => {});
      if (attempt >= 30) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  try {
    await bootstrapFreshDatabase(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // Never block the app from starting: the server's own boot makes most tables.
    console.error('[censaiOS] First-start database setup did not finish:', err?.message || err);
  });
}
