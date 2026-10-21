// The setup ledger: which docker/*.sql files a database has, so a later fix
// can tell what each install got. Used by the Docker first start
// (freshDatabase.js) and the laptop app (desktop-stack/start.mjs). It never
// runs an old setup file on an existing install; it only writes down names.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEDGER_FILE = 'docker/090-setup-ledger.sql';
export const APPLIED = 'applied';
export const FOUND = 'found already there';

/** A short fingerprint of a file's text, to spot a file that changed later. */
export function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 16);
}

/** Every setup file in docker/, as docker/<name>. */
export function setupFiles(root) {
  return fs.readdirSync(path.join(root, 'docker')).filter((f) => f.endsWith('.sql')).sort().map((f) => `docker/${f}`);
}

async function ensureLedger(client, root) {
  await client.query(fs.readFileSync(path.join(root, LEDGER_FILE), 'utf8'));
}

async function recordedCount(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM censai_setup_ledger');
  return rows[0]?.n || 0;
}

async function record(client, root, files, how) {
  let added = 0;
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const res = await client.query(
      'INSERT INTO censai_setup_ledger (file, fingerprint, how) VALUES ($1, $2, $3) ON CONFLICT (file) DO NOTHING',
      [file, fingerprint(text), how],
    );
    added += res.rowCount || 0;
  }
  return added;
}

async function startLine(client, log, added) {
  log?.info?.('setup ledger', { recorded: await recordedCount(client), new: added });
}

/** After a first start: every file that ran is "applied" (the ledger file too). */
export async function recordApplied(client, { root, applied, log = null }) {
  await ensureLedger(client, root);
  const files = [...new Set([...applied, LEDGER_FILE])].sort();
  const added = await record(client, root, files, APPLIED);
  await startLine(client, log, added);
  return added;
}

/**
 * An existing install: the first time the ledger is there, write down every
 * file present as "found already there"; later starts add nothing.
 */
export async function recordExisting(client, { root, log = null }) {
  await ensureLedger(client, root);
  if ((await recordedCount(client)) > 0) {
    await startLine(client, log, 0);
    return 0;
  }
  const added = await record(client, root, setupFiles(root), FOUND);
  await startLine(client, log, added);
  return added;
}
