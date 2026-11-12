// What Tailscale says about this computer's tailnet right now, kept for a few
// seconds so a busy board does not ask on every request.
//
// Two places to read it from, in this order:
//  1. A feed file, tailnet-status.json, in the censaiOS state folder. Inside
//     Docker the app cannot talk to Tailscale, so the box writes that file
//     once a minute (scripts/home-server-tailnet.sh). A file older than three
//     minutes counts as
//     no answer: it is better to let nobody in than to trust a stale list.
//  2. The `tailscale` program itself, when censaiOS runs straight on the
//     computer (the desktop app, a server started without Docker).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { isJestRun } from '../security/testShortcut.js';
import { NOT_CONNECTED, parseTailnetStatus } from './parse.js';

export const FEED_FILE = 'tailnet-status.json';
export const FEED_MAX_AGE_MS = 3 * 60 * 1000;
const FRESH_MS = 20 * 1000;
// One slow answer from Tailscale should not throw every device off the board.
const HICCUP_GRACE_MS = 2 * 60 * 1000;
const PROGRAMS = process.platform === 'win32'
  ? ['tailscale.exe', 'C:\\Program Files\\Tailscale\\tailscale.exe', 'C:\\Program Files (x86)\\Tailscale IPN\\tailscale.exe']
  : ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

let program = null;
let cache = { at: 0, status: { ...NOT_CONNECTED, reason: 'not-checked', source: 'none' } };
let pending = null;
let lastGoodAt = 0;
let reader = readFromThisComputer;

function feedFolders(env) {
  const folders = [env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state')];
  // docker-compose.yml keeps the log in the censaiOS folder on the box
  // itself; the feed file sits one level up from it.
  if (env.LOG_DIR) folders.push(path.dirname(path.resolve(env.LOG_DIR)));
  return [...new Set(folders)];
}

/** @returns {{ raw?: object, reason?: string }|null} null when there is no feed file at all */
export function readFeed({ env = process.env, now = Date.now() } = {}) {
  let stale = false;
  for (const folder of feedFolders(env)) {
    const file = path.join(folder, FEED_FILE);
    try {
      const age = now - fs.statSync(file).mtimeMs;
      if (age > FEED_MAX_AGE_MS) { stale = true; continue; }
      return { raw: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (error) {
      if (error?.code !== 'ENOENT') stale = true;
    }
  }
  return stale ? { reason: 'stale-feed' } : null;
}

function run(file) {
  return new Promise((resolve, reject) => {
    execFile(file, ['status', '--json'], { timeout: 5000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      // `tailscale status` exits 1 while signed out but still prints the JSON.
      if (stdout && stdout.trim().startsWith('{')) return resolve(stdout);
      return reject(error || new Error('no output'));
    });
  });
}

async function askTailscale() {
  // A test run never starts the real program: tests hand in a made-up
  // tailnet (setTailnetReader), and a build box may have Tailscale on it.
  if (isJestRun()) return { reason: 'not-installed' };
  for (const file of program ? [program] : PROGRAMS) {
    try {
      const text = await run(file);
      program = file;
      return { raw: JSON.parse(text) };
    } catch (error) {
      if (error?.code !== 'ENOENT') return { reason: 'no-answer' };
    }
  }
  return { reason: 'not-installed' };
}

/**
 * Docker Desktop (Windows and Mac) runs containers inside a small virtual
 * machine, and every visitor then arrives from that machine's own address.
 * censaiOS cannot tell devices apart there, so it lets none in.
 */
export function insideDockerDesktop(kernel = os.release()) {
  return /linuxkit|microsoft/i.test(String(kernel));
}

/** Why a copy inside Docker has no list of Tailscale devices. */
export function containerReason(feed, kernel = os.release()) {
  if (insideDockerDesktop(kernel)) return 'docker-desktop';
  return feed?.reason || 'needs-feed';
}

async function readFromThisComputer({ env = process.env } = {}) {
  const inContainer = env.CENSAI_IN_CONTAINER === '1';
  if (inContainer && insideDockerDesktop()) return { reason: 'docker-desktop', source: 'none' };
  const feed = readFeed({ env });
  if (feed?.raw) return { ...feed, source: 'feed' };
  if (inContainer) return { reason: containerReason(feed), source: 'none' };
  return { ...(await askTailscale()), source: 'program' };
}

function toStatus(answer) {
  const parsed = answer?.raw ? parseTailnetStatus(answer.raw) : { ...NOT_CONNECTED };
  const reason = parsed.connected ? 'ok' : (answer?.reason || 'signed-out');
  return { ...parsed, reason, source: answer?.source || 'none' };
}

/** The last answer, however old. For checks that cannot wait. */
export function lastTailnetStatus() {
  return cache.status;
}

/** A fresh enough answer; asks again when the last one is older than maxAgeMs. */
export async function tailnetStatus({ maxAgeMs = FRESH_MS, now = Date.now() } = {}) {
  if (now - cache.at <= maxAgeMs) return cache.status;
  if (!pending) {
    pending = Promise.resolve()
      .then(() => reader())
      .then((answer) => toStatus(answer), () => toStatus({ reason: 'no-answer' }))
      .then((status) => {
        const at = Date.now();
        if (status.connected) lastGoodAt = at;
        // Tailscale gave no answer this once: keep the last good one a little
        // longer, and ask again in a few seconds.
        if (status.reason === 'no-answer' && cache.status.connected && at - lastGoodAt < HICCUP_GRACE_MS) {
          cache = { at: at - FRESH_MS + 5000, status: cache.status };
          return cache.status;
        }
        cache = { at, status };
        return status;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Tests change who answers without forgetting the last answer. */
export function swapTailnetReader(fn) {
  reader = fn || readFromThisComputer;
}

/** Tests hand in a made-up tailnet. `null` puts the real reader back. */
export function setTailnetReader(fn) {
  reader = fn || readFromThisComputer;
  cache = { at: 0, status: { ...NOT_CONNECTED, reason: 'not-checked', source: 'none' } };
  pending = null;
  lastGoodAt = 0;
}
