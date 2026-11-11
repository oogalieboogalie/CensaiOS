// Scheduled pass over open pull requests. Dry-run unless turned off in the environment.
// The only GitHub write is squash-merge. This file never pushes and never force-pushes.
import { confirmationStore } from '../confirmations/store.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { matchingCi, reviewClear } from './clear.js';
import { mergeBotConfig } from './config.js';
import { decideMerge, isHeldTitle } from './decide.js';
import { createGitHub } from './github.js';
import { runKrakenLock } from './lock.js';
import { createRevokeStore } from './revokes.js';
import { riskyDetail } from './risk.js';

const log = createLogger('merge-bot');
let handle = null;
let tickBusy = false;

export async function runMergeBotTick({
  config = mergeBotConfig(),
  github = createGitHub(),
  lock = runKrakenLock,
  store = confirmationStore(),
  revokes,
  revokeOptions,
} = {}) {
  if (tickBusy) return { skipped: 'busy' };
  if (!config.enabled) return { skipped: 'disabled' };
  if (!config.token) return { skipped: 'no-token' };
  if (!config.repo || !config.repo.includes('/')) return { skipped: 'no-repo' };
  let book = revokes;
  if (!book) {
    try {
      book = createRevokeStore(revokeOptions);
    } catch (err) {
      log.info('merge bot has nowhere to keep revokes', { code: safeErrorCode(err) });
      return { skipped: 'revokes' };
    }
  }
  tickBusy = true;
  try {
    return await pass(config, github, lock, store, book);
  } finally {
    tickBusy = false;
  }
}

async function pass(config, github, lock, store, revokes) {

  let listed;
  try {
    listed = await github.listOpenPulls({ token: config.token, repo: config.repo });
  } catch (err) {
    log.info('merge bot could not list pull requests', { code: safeErrorCode(err) });
    return { skipped: 'list-failed' };
  }

  const results = [];
  for (const number of listed.numbers) {
    results.push(await onePull({ config, github, lock, store, revokes, number }));
  }
  if (listed.complete) store.settleClosed(listed.numbers);
  const counts = { seen: results.length };
  for (const row of results) counts[row.action] = (counts[row.action] || 0) + 1;
  log.info('merge bot pass', counts);
  return { results };
}

async function onePull({ config, github, lock, store, revokes, number }) {
  if (number === 300) return { number, action: 'refuse', reason: 'never-300' };
  let pull;
  let comments;
  let checks;
  let files;
  let commits;
  try {
    pull = await github.loadPull({ token: config.token, repo: config.repo, number });
    [comments, checks, files, commits] = await Promise.all([
      github.comments({ token: config.token, repo: config.repo, number }),
      github.checks({ token: config.token, repo: config.repo, sha: pull.headSha }),
      github.files({ token: config.token, repo: config.repo, number }),
      github.commits({ token: config.token, repo: config.repo, number }),
    ]);
  } catch (err) {
    log.info('merge bot could not read a pull request', { pr: number, code: safeErrorCode(err) });
    return { number, action: 'wait', reason: 'unread' };
  }

  let prior;
  try {
    prior = revokes.forPull(config.repo, number);
  } catch (err) {
    log.info('merge bot could not read revokes', { pr: number, code: safeErrorCode(err) });
    return { number, action: 'wait', reason: 'revokes' };
  }
  const verdict = reviewClear(comments, {
    publicKey: config.publicKey,
    repo: config.repo,
    number,
    sha: pull.headSha,
    revoked: prior,
    commits,
  });
  try {
    revokes.remember(config.repo, number, verdict.remember);
  } catch (err) {
    log.info('merge bot could not store a revoke', { pr: number, code: safeErrorCode(err) });
    return { number, action: 'wait', reason: 'revokes' };
  }
  const fileLock = await lock(number, { token: config.token, repo: config.repo }).catch(() => ({ ok: false }));
  const decision = decideMerge({
    number,
    headSha: pull.headSha,
    draft: pull.draft,
    held: isHeldTitle(pull.title),
    fork: pull.fork,
    base: pull.base,
    files,
    clear: verdict.clear,
    ci: matchingCi(checks, { name: config.checkName, sha: pull.headSha }),
    mergeable: pull.mergeable,
    lock: fileLock,
    dryRun: config.dryRun,
  });

  if (decision.action === 'confirm') {
    store.upsertRisky({
      number,
      sha: pull.headSha,
      title: `Pull request ${number} needs you`,
      detail: riskyDetail(decision.categories),
      actionLabel: `Mark pull request ${number} handled`,
      url: pull.url,
    });
  }
  if (decision.action !== 'merge') return { number, action: decision.action, reason: decision.reason };

  try {
    await github.squashMerge({ token: config.token, repo: config.repo, number, sha: pull.headSha });
    store.resolveRisky(number);
    return { number, action: 'merge', reason: 'clear' };
  } catch (err) {
    log.info('squash merge refused', { pr: number, code: safeErrorCode(err) });
    return { number, action: 'wait', reason: 'merge-failed' };
  }
}

export function startMergeBotWorker(deps = {}) {
  if (handle) return;
  const config = deps.config || mergeBotConfig();
  if (!config.enabled) {
    log.info('merge bot is off');
    return;
  }
  log.info('merge bot scheduled', { dryRun: config.dryRun, intervalMs: config.intervalMs });
  const tick = () => {
    runMergeBotTick({ ...deps, config }).catch((err) => {
      log.error('merge bot tick failed', { code: safeErrorCode(err) });
    });
  };
  handle = setInterval(tick, config.intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  const first = setTimeout(tick, 15_000);
  if (typeof first.unref === 'function') first.unref();
}
