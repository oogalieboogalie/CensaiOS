// Shared pieces for the end-to-end checks: finding a browser and a database
// on this runner, a scratch database, and starting the real app.
//
// Nothing here downloads anything. The browser comes from CHROMIUM_PATH or
// the Playwright browser folder (PLAYWRIGHT_BROWSERS_PATH); the database from
// E2E_DATABASE_URL, a Postgres account allowed to create databases.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CHROME_IN_FOLDER = [
  ['chrome-linux', 'chrome'],
  ['chrome-linux64', 'chrome'],
  ['chrome-win', 'chrome.exe'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
];

/** The Chromium to drive, or null when this runner has none. */
export function findChromium(env = process.env, exists = fs.existsSync, list = (d) => fs.readdirSync(d)) {
  if (env.CHROMIUM_PATH) return exists(env.CHROMIUM_PATH) ? env.CHROMIUM_PATH : null;
  const folder = env.PLAYWRIGHT_BROWSERS_PATH;
  if (!folder || !exists(folder)) return null;
  const builds = list(folder).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse();
  for (const build of builds) {
    for (const parts of CHROME_IN_FOLDER) {
      const candidate = path.join(folder, build, ...parts);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/** Why this runner cannot run the check, or '' when it can. */
export async function whatIsMissing({ env = process.env, chromium = findChromium(env), pg } = {}) {
  const missing = [];
  if (!env.E2E_DATABASE_URL) missing.push('database');
  else {
    const client = new pg.Client({ connectionString: env.E2E_DATABASE_URL });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } catch {
      missing.push('database');
    } finally {
      await client.end().catch(() => {});
    }
  }
  if (!chromium) missing.push('browser');
  return missing.join(' and ');
}

/** Makes an empty database and sets it up the way a new install would. */
export async function makeScratchDatabase(pg, adminUrl, name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const fresh = await import(pathToFileURL(path.join(ROOT, 'server/boot/freshDatabase.js')).href);
    const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
    // Postgres runs these itself on a new Docker volume; do the same here.
    const readFile = (file) => fs.promises.readFile(path.join(ROOT, file), 'utf8');
    await fresh.applySqlFiles(client, fresh.composeInitSqlFiles(compose), readFile);
    await fresh.bootstrapFreshDatabase(client, { root: ROOT, log: () => {} });
  } finally {
    await client.end();
  }
  return url.toString();
}

export async function dropScratchDatabase(pg, adminUrl, name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
}

/** Starts a child process; its output goes to the given log file only. */
export function startProcess(command, args, { env, logFile }) {
  const out = fs.openSync(logFile, 'w');
  const child = spawn(command, args, { cwd: ROOT, env, stdio: ['ignore', out, out] });
  child.on('exit', () => fs.closeSync(out));
  return child;
}

export async function waitForUrl(url, timeoutMs, { child, isReady = (res) => res.ok } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (child && child.exitCode !== null) throw new Error(`stopped before ${url} answered (exit ${child.exitCode})`);
    try {
      if (isReady(await fetch(url))) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > until) throw new Error(`${url} did not answer within ${Math.round(timeoutMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** Prints one step line: name, passed or failed, and how long it took. */
export async function step(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`e2e step "${name}": passed (${Date.now() - started} ms)`);
    return result;
  } catch (error) {
    console.log(`e2e step "${name}": failed (${Date.now() - started} ms)`);
    throw error;
  }
}
