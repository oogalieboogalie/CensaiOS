/**
 * Put a built update in only when the running app is older than a build
 * that is already made, and nobody is working. The Windows updater asks
 * this once when it starts (GET /api/app-update/idle) and does the swap.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { anyoneWorking } from './anyoneWorking.js';

const COMMIT = /^[0-9a-f]{7,40}$/;

function readText(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').trim();
  } catch {
    return '';
  }
}

/** { running, built, head } from the updater's notes. head is the code on disk. */
export function builtState(dir, head = '') {
  return {
    running: dir ? readText(dir, 'running.txt') : '',
    built: dir ? readText(dir, 'built.txt') : '',
    head: String(head || '').trim(),
  };
}

/**
 * A build of the code on disk is already made, and the running app is older.
 * A newer pull that has not been built yet is left for the normal look.
 */
export function newerBuildReady({ running = '', built = '', head = '' } = {}) {
  const builtCommit = String(built || '').trim();
  const headCommit = String(head || '').trim();
  const runningCommit = String(running || '').trim();
  if (!COMMIT.test(builtCommit) || !COMMIT.test(headCommit)) return false;
  if (builtCommit !== headCommit) return false;
  return builtCommit !== runningCommit;
}

/** True only when a made build is waiting and working is exactly false. */
export function shouldPutUpdateIn({ running, built, head, working } = {}) {
  if (working !== false) return false;
  return newerBuildReady({ running, built, head });
}

export function repoHead(repo, { exec = execFile } = {}) {
  if (!repo) return Promise.resolve('');
  return new Promise((resolve) => {
    exec('git', ['rev-parse', 'HEAD'], { cwd: repo, timeout: 5000 }, (error, stdout) => {
      if (error) resolve('');
      else resolve(String(stdout || '').trim());
    });
  });
}

/** What GET /api/app-update/idle answers. Never throws. */
export async function idleAnswer({
  dir, repo, busy, headOf = repoHead, terminals, consoleAgents, recentInput,
} = {}) {
  let working;
  try {
    const found = await anyoneWorking({
      busy,
      ...(terminals ? { terminals } : {}),
      ...(consoleAgents ? { consoleAgents } : {}),
      ...(recentInput ? { recentInput } : {}),
    });
    working = !!found.working;
  } catch {
    working = true;
  }
  let head;
  try {
    head = repo ? await headOf(repo) : '';
  } catch {
    head = '';
  }
  const state = builtState(dir, head);
  const ready = newerBuildReady(state);
  return { working, ready, putIn: shouldPutUpdateIn({ ...state, working }) };
}
