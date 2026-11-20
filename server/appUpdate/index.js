/**
 * App update on this PC (scripts/auto-update.ps1 does the work on Windows).
 *
 * The updater runs next to the Docker app and talks to it through files in
 * the repo folder, which the container sees at /workspace/CensaiHub:
 *
 *   .homebase-state/update/ready.json         an update is pulled and built
 *   .homebase-state/update/running.txt        the commit the app runs now
 *   .homebase-state/update/watcher.json       the updater's heartbeat
 *   .homebase-state/update/restart-requested  written here: "put it in now"
 *   .homebase-state/update/check-requested    written here: "look for one now"
 *   .homebase-state/update/checked.json       the updater's last look: { at, result }
 *   .homebase-state/update/step.txt           while a look runs: looking, downloading or building
 *
 * result is up-to-date, ready, build-failed, docker-off, blocked (this PC's
 * master has its own commits or edits, so it cannot fast-forward) or
 * side-branch (this PC's folder is not on master, so no update can come in).
 */

import fs from 'fs';
import path from 'path';
import { selfRepo } from '../selfFix/patches.js';

// The updater writes its heartbeat every few seconds; a minute of silence
// means it is not running (censaiOS was opened some way that did not start it).
const WATCHER_FRESH_MS = 60_000;

// On a Linux computer the updater can run on demand instead: it starts when
// one of the request files below is written and stops when it is done
// (scripts/censaios-update.path), so there is no heartbeat between runs.
// CENSAI_UPDATER_ON_DEMAND=1 tells the app that this is how its computer works.
export function updaterOnDemand(env = process.env) {
  return env.CENSAI_UPDATER_ON_DEMAND === '1';
}
const COMMIT = /^[0-9a-f]{7,40}$/;

export function updateDir(repoRoot = selfRepo()) {
  return repoRoot ? path.join(repoRoot, '.homebase-state', 'update') : null;
}

function readText(dir, name) {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, '').trim();
  } catch {
    return '';
  }
}

function readJson(dir, name) {
  const text = readText(dir, name);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** What the "Update ready" note needs. Never throws. */
export function updateStatus({ dir = updateDir(), now = Date.now(), onDemand = updaterOnDemand() } = {}) {
  const empty = { ready: null, running: null, watching: false, requested: false, checking: false, checked: null, step: null };
  if (!dir) return empty;
  const running = readText(dir, 'running.txt');
  const heartbeat = readJson(dir, 'watcher.json');
  const beatAt = Date.parse(heartbeat?.at || '');
  const raw = readJson(dir, 'ready.json');
  const commit = String(raw?.commit || '');
  const ready = COMMIT.test(commit) && commit !== running
    ? {
      commit,
      builtAt: typeof raw.builtAt === 'string' ? raw.builtAt : null,
      changes: [].concat(raw.changes || []).map((c) => String(c).trim()).filter(Boolean).slice(0, 20),
    }
    : null;
  return {
    ready,
    running: COMMIT.test(running) ? running : null,
    watching: onDemand || (Number.isFinite(beatAt) && now - beatAt < WATCHER_FRESH_MS),
    requested: fs.existsSync(path.join(dir, 'restart-requested')),
    checking: fs.existsSync(path.join(dir, 'check-requested')),
    checked: lastCheck(dir),
    step: currentStep(dir, now),
  };
}

// While a look runs the updater names the step it is on, so the panel can show
// how far along it is. An updater that stopped mid-look leaves the file behind:
// after 45 minutes it is not believed any more.
const STEPS = ['looking', 'downloading', 'building'];
const STEP_FRESH_MS = 45 * 60_000;

function currentStep(dir, now) {
  const step = readText(dir, 'step.txt');
  if (!STEPS.includes(step)) return null;
  try {
    return now - fs.statSync(path.join(dir, 'step.txt')).mtimeMs < STEP_FRESH_MS ? step : null;
  } catch {
    return null;
  }
}

const RESULTS = ['up-to-date', 'ready', 'build-failed', 'docker-off', 'blocked', 'side-branch'];

function lastCheck(dir) {
  const raw = readJson(dir, 'checked.json');
  const at = typeof raw?.at === 'string' && Number.isFinite(Date.parse(raw.at)) ? raw.at : null;
  return at ? { at, result: RESULTS.includes(raw.result) ? raw.result : 'up-to-date' } : null;
}

function needWatcher(dir) {
  if (!dir) throw Object.assign(new Error('This copy of censaiOS does not update itself.'), { statusCode: 409 });
  const status = updateStatus({ dir });
  if (!status.watching) {
    throw Object.assign(new Error('The updater is not running.'), { statusCode: 409, code: 'updater-not-running' });
  }
  return status;
}

/** Ask the updater to look for an update now instead of at its next round. */
export function requestCheck({ dir = updateDir(), now = new Date() } = {}) {
  const status = needWatcher(dir);
  fs.writeFileSync(path.join(dir, 'check-requested'), now.toISOString());
  return { ...status, checking: true, askedAt: now.toISOString() };
}

/** Throws unless a built update waits and the updater can put it in. */
export function assertRestartable(dir = updateDir()) {
  if (!dir) throw Object.assign(new Error('This copy of censaiOS does not update itself.'), { statusCode: 409 });
  if (!updateStatus({ dir }).ready) throw Object.assign(new Error('There is no update waiting.'), { statusCode: 409 });
  return needWatcher(dir);
}

/** Ask the updater to put the built update in now. */
export function requestRestart({ dir = updateDir() } = {}) {
  const status = assertRestartable(dir);
  fs.writeFileSync(path.join(dir, 'restart-requested'), new Date().toISOString());
  return { ...status, requested: true };
}
