#!/usr/bin/env node
// One real end-to-end check: two made-up people on the same board.
//
// Starts the real server against a scratch Postgres and the real browser app,
// signs in Pat Example and Sam Example in two separate browser sessions, Pat
// shares the board with Sam, opens a note on it and types "made-up note", and
// Sam must see that text on the same board within 5 seconds.
//
// Usage:
//   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres npm run e2e:two-people
//
// Settings (all optional except the database):
//   E2E_DATABASE_URL  a Postgres account that may create databases
//   CHROMIUM_PATH     the browser to drive (else PLAYWRIGHT_BROWSERS_PATH)
//   E2E_SHOTS_DIR     save Pat's and Sam's screens there as PNGs
//   E2E_SAM_EXPECTS   the text Sam waits for (to prove the check can fail)
//
// With no database or browser it prints a "skipped" line and exits 0.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  ROOT, dropScratchDatabase, findChromium, makeScratchDatabase, startProcess, step, waitForUrl, whatIsMissing,
} from './runner.mjs';

const API_PORT = 3001; // vite.config.js sends /api and the sockets here
const WEB_PORT = 5173;
const WEB = `http://localhost:${WEB_PORT}`;
const NOTE = 'made-up note';
const SEE_WITHIN_MS = 5000;
const PAT = { email: 'pat@example.com', name: 'Pat Example' };
const SAM = { email: 'sam@example.com', name: 'Sam Example' };

async function signIn(context, person) {
  const res = await context.request.post(`${WEB}/api/auth/developer`, {
    data: person,
    headers: { Origin: WEB },
  });
  if (!res.ok()) throw new Error(`sign-in for ${person.name} answered ${res.status()}`);
}

async function shareBoard(context, withPerson) {
  const res = await context.request.post(`${WEB}/api/workspaces/personal`, { headers: { Origin: WEB } });
  if (!res.ok()) throw new Error(`personal board answered ${res.status()}`);
  const { workspace } = await res.json();
  const invite = await context.request.post(`${WEB}/api/workspaces/${workspace.id}/members`, {
    data: { email: withPerson.email },
    headers: { Origin: WEB },
  });
  if (!invite.ok()) throw new Error(`sharing the board answered ${invite.status()}`);
  return workspace.id;
}

async function openBoard(page, workspaceId) {
  await page.goto(`${WEB}/?workspace=${workspaceId}`);
  // Vite serves the app's own files, so the page can hand over its live store.
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.evaluate(async () => {
    const { useWorkspaceStore } = await import('/src/lib/store.js');
    window.__e2eStore = useWorkspaceStore;
  });
  await page.waitForFunction((id) => window.__e2eStore.getState().workspaceId === id, workspaceId, {
    timeout: 60_000,
    polling: 500,
  });
  // Let the shared board connect before anyone writes on it.
  await page.waitForTimeout(1500);
}

async function patWritesNote(page) {
  // A Document window opened in its typing mode stands in for a sticky note.
  await page.evaluate(() => (
    window.__e2eStore.getState().spawnAt('doc', { title: 'Sticky note', text: '', isEditing: true }, { x: 120, y: 120 })
  ));
  const box = page.locator('[data-doc-body] textarea').first();
  await box.waitFor({ state: 'visible', timeout: 10_000 });
  await box.click();
  await page.keyboard.type(NOTE);
}

async function samSees(page, text) {
  await page.waitForFunction(
    (want) => window.__e2eStore.getState().wins.some((w) => String(w.text || w.props?.text || '').includes(want)),
    text,
    { timeout: SEE_WITHIN_MS, polling: 200 },
  );
}

async function main() {
  const { default: pg } = await import('pg');
  const chromiumPath = findChromium();
  const missing = await whatIsMissing({ chromium: chromiumPath, pg });
  if (missing) {
    console.log(`e2e two-people: skipped: no ${missing} on this runner`);
    return;
  }
  const { chromium } = await import('playwright-core');
  const started = Date.now();
  const dbName = `censai_e2e_${Date.now()}`;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-e2e-'));
  const children = [];
  let browser;
  try {
    const databaseUrl = await step('scratch database', () => makeScratchDatabase(pg, process.env.E2E_DATABASE_URL, dbName));
    const env = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PORT: String(API_PORT),
      SESSION_SECRET: crypto.randomBytes(24).toString('hex'),
      CENSAI_MODE: 'local_desktop',
      CENSAI_ALLOW_DEVELOPER_LOGIN: 'true',
      APP_ORIGIN: WEB,
      NODE_ENV: 'development',
    };
    await step('start the server', async () => {
      const server = startProcess(process.execPath, ['server.js'], { env, logFile: path.join(logDir, 'server.log') });
      children.push(server);
      await waitForUrl(`http://127.0.0.1:${API_PORT}/api/health`, 120_000, { child: server });
    });
    await step('start the browser app', async () => {
      const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
      const web = startProcess(process.execPath, [vite, '--port', String(WEB_PORT), '--strictPort'], { env, logFile: path.join(logDir, 'web.log') });
      children.push(web);
      await waitForUrl(`${WEB}/`, 120_000, { child: web });
    });
    browser = await chromium.launch({ executablePath: chromiumPath, headless: true });
    const patContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const samContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await step('sign in Pat and Sam', async () => {
      await signIn(patContext, PAT);
      await signIn(samContext, SAM);
    });
    const workspaceId = await step('Pat shares the board with Sam', () => shareBoard(patContext, SAM));
    const pat = await patContext.newPage();
    const sam = await samContext.newPage();
    await step('both open the board', () => Promise.all([openBoard(pat, workspaceId), openBoard(sam, workspaceId)]));
    await step('Pat writes the note', () => patWritesNote(pat));
    await step('Sam sees it within 5 seconds', () => samSees(sam, process.env.E2E_SAM_EXPECTS || NOTE));
    if (process.env.E2E_SHOTS_DIR) {
      fs.mkdirSync(process.env.E2E_SHOTS_DIR, { recursive: true });
      await pat.screenshot({ path: path.join(process.env.E2E_SHOTS_DIR, 'pat.png') });
      await sam.screenshot({ path: path.join(process.env.E2E_SHOTS_DIR, 'sam.png') });
    }
    console.log(`e2e two-people: passed (${Date.now() - started} ms)`);
  } catch (error) {
    console.log(`e2e two-people: failed (${Date.now() - started} ms): ${String(error.message).split('\n')[0]}`);
    console.log(`e2e two-people: server and app output kept in ${logDir}`);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    for (const child of children) child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await dropScratchDatabase(pg, process.env.E2E_DATABASE_URL, dbName).catch(() => {});
  }
}

main();
