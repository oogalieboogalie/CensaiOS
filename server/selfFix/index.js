import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { LOCAL_STATE_DIR } from '../routes/files/pathUtils.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { getCliTaskManager, resolveCliKey } from '../cli-agents/index.js';
import { getAdapter } from '../cli-agents/adapters/index.js';
import { detectVersion, hasCliLogin } from '../cli-agents/install.js';
import { agentHome, inContainer } from '../cli-agents/paths.js';
import { SelfFixStore } from './store.js';
import { SelfFix } from './service.js';
import { selfRepo } from './patches.js';
import { watchServerLog, recentLines } from './logTail.js';
import { scrubStack, scrubText } from './scrub.js';

export { SelfFix } from './service.js';
export { SelfFixStore } from './store.js';

const log = createLogger('self-fix');
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = path.join(LOCAL_STATE_DIR, 'self-fix');
const INBOX = path.join(STATE_DIR, 'crash-inbox.jsonl');
const READY_TTL_MS = 5 * 60 * 1000;

/** The account fixes run as: the install's owner (first admin), never a guest. */
async function ownerId() {
  try {
    const { rows } = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

let readyCache = null;
async function claudeCodeReady() {
  if (readyCache && Date.now() - readyCache.at < READY_TTL_MS) return readyCache.value;
  const adapter = getAdapter('claudecode');
  const installed = (await detectVersion('claudecode').catch(() => ({ installed: false }))).installed;
  let signedIn = false;
  if (installed) {
    const key = await resolveCliKey({ adapter, userId: await ownerId() }).catch(() => null);
    signedIn = Boolean(key?.key) || (!key?.blocked && hasCliLogin('claudecode', agentHome() || os.homedir()));
  }
  const value = { ok: installed && signedIn, installed, signedIn };
  readyCache = { at: Date.now(), value };
  return value;
}

let service = null;
export function getSelfFix() {
  if (!service) {
    service = new SelfFix({
      store: new SelfFixStore({ file: path.join(STATE_DIR, 'state.json') }),
      tasks: getCliTaskManager(),
      repoRoot: selfRepo(),
      appRoot: APP_ROOT,
      readiness: claudeCodeReady,
      runAs: ownerId,
      logLines: () => recentLines(40),
      isOwnerPc: () => getRuntimeMode() === RUNTIME_MODES.LOCAL_DESKTOP,
    });
  }
  return service;
}

/**
 * Called from server.js when the process is about to die: no time for
 * anything async, so the crash goes into a small inbox file that the next
 * start turns into a report.
 */
export function recordCrashSync(kind, err) {
  if (process.env.CENSAI_SELF_FIX === 'off') return;
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(INBOX, `${JSON.stringify({
      kind: 'server-crash', source: 'server', area: kind,
      message: scrubText(err?.message || String(err), 600), stack: scrubStack(err?.stack), logs: recentLines(30),
    })}\n`);
  } catch { /* crash logging must never throw */ }
}

function drainCrashInbox(selfFix) {
  let text;
  try {
    text = fs.readFileSync(INBOX, 'utf8');
    fs.rmSync(INBOX, { force: true });
  } catch {
    return;
  }
  for (const line of text.split('\n').filter(Boolean).slice(-10)) {
    try {
      const crash = JSON.parse(line);
      const original = selfFix.logLines;
      selfFix.logLines = () => crash.logs || [];
      selfFix.capture(crash);
      selfFix.logLines = original;
    } catch { /* skip a broken line */ }
  }
}

/**
 * Server start: apply fixes waiting from last time, turn last run's crash
 * into a report, and start watching the log for errors.
 * CENSAI_SELF_FIX=off turns the whole thing off (no capture, no fixes).
 */
export async function startSelfFix() {
  if (process.env.CENSAI_SELF_FIX === 'off') return null;
  const selfFix = getSelfFix();
  // In Docker the app runs from its image, so the launcher applies fixes and
  // rebuilds (scripts/self-fix-patches.ps1); here we only read where they are.
  const results = await selfFix.boot({ apply: process.env.CENSAI_SELF_FIX_APPLY !== 'off' && !inContainer() });
  for (const r of results) log.info('self-fix at start', r);
  drainCrashInbox(selfFix);
  watchServerLog((input) => selfFix.capture(input));
  return selfFix;
}
