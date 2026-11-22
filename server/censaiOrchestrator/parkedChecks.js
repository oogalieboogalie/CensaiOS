// Censai the orchestrator: jobs waiting for their pull request's checks (jobPr.js).
// The wait never holds a runner slot: the job is saved as 'waiting_checks' with its
// pull request and commit (job.prWait), and a timer here reads the checks. Once final,
// the job is done, sent back ('sendback') or stuck, and its plan rejoins the runner's
// queue. After a restart the runner's recovery parks it again, on the same branch and PR.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { setItem } from './checklist.js';
import { planFromRow } from './planState.js';
import { FINAL_PLAN, MAX_ATTEMPTS, addStep, agentName, clip, settleStep } from './shape.js';
import { loadPlan, settleParkedPlan } from './store.js';

const log = createLogger('censai-orchestrator');
export const PARK_POLL_MS = 30 * 1000;

const parked = new Map(); // plan id -> deps
let resume = null; // the runner's startPlan
let ticker = null;
let looking = null;

/** The runner tells this file how a plan goes back into its queue. */
export function setParkedResume(fn) {
  resume = fn;
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/** Wait for this plan's job's checks outside the runner's slots. */
export function park(id, deps) {
  parked.set(id, deps);
  log.info('plan waits for checks', { planId: id, waiting: parked.size });
  if (!ticker) {
    ticker = setInterval(() => { lookAtParked(); }, PARK_POLL_MS);
    ticker.unref?.();
  }
}

/** Stop waiting for one plan (stopped), or for every plan (no id: tests). */
export function forgetParked(id) {
  if (id === undefined) parked.clear();
  else parked.delete(id);
  if (!parked.size) stopTicker();
}

export const isParked = (id) => parked.has(id);

const STATE = { passed: 'ticked', none: 'ticked', failed: 'failed' };

/** Apply one final look at the checks to the job. */
function settle(job, seen) {
  const name = agentName(job.agentId);
  const attempt = job.prWait?.attempt || job.attempts || 1;
  const items = job.checklist.filter((item) => item.how === 'pr');
  for (const item of items) {
    setItem(item, STATE[seen.state] || 'unknown', seen.line, seen.detail || '');
    // The last thing really known about the checks, for the Kraken arm (arms.js notePr).
    item.lastChecks = { state: seen.state, attempt };
    if (seen.state === 'none') item.checks = 'none';
    else delete item.checks;
  }
  if (seen.state === 'passed' || seen.state === 'none') {
    job.status = 'done';
    job.error = null;
    job.stuckOn = null;
    settleStep(job, seen.state === 'none' ? 'No checks ran on the pull request' : 'Its checks on GitHub passed', seen.state === 'none' ? 'note' : 'done');
    return;
  }
  if (seen.state === 'failed' && attempt < MAX_ATTEMPTS) {
    job.status = 'sendback';
    settleStep(job, 'Its checks on GitHub failed', 'bad');
    addStep(job, `Sent it back to ${name} to fix: ${items.map((item) => item.text).join('; ')}`, 'note');
    return;
  }
  job.status = 'stuck';
  job.error = clip(seen.state === 'failed' ? `${name} tried twice and it still does not check out. ${seen.line}` : seen.line, 300);
  job.stuckOn = items[0]?.n ?? null;
  settleStep(job, items[0] ? `Stuck on "${clip(items[0].text, 80)}"` : job.error, 'bad');
}

/** One look at one parked plan's checks. */
async function lookAt(id, deps) {
  const row = await loadPlan(deps.db, id);
  const plan = row && !FINAL_PLAN.has(row.status) ? planFromRow(row) : null;
  const job = plan?.jobs.find((entry) => entry.status === 'waiting_checks');
  if (!job) {
    forgetParked(id);
    return;
  }
  const seen = await deps.readJobChecks({ db: deps.db, plan, job, now: deps.now() });
  if (!parked.has(id)) return; // stopped meanwhile
  if (!seen.final) {
    for (const item of job.checklist.filter((entry) => entry.how === 'pr')) setItem(item, 'checking', seen.line);
    // Only while still waiting: a copy read before another server moved it on never puts it back.
    if (!(await settleParkedPlan(deps.db, plan, job.n))) forgetParked(id);
    return;
  }
  settle(job, seen);
  forgetParked(id);
  log.info('job checks back', { planId: id, part: job.n, checks: seen.state, next: job.status });
  // Null: the plan was stopped, or another server already carried it on; that stands.
  if (await settleParkedPlan(deps.db, plan, job.n)) resume?.(id, deps);
}

/** Look at every parked plan once. The timer does this; tests call it to move on. */
export function lookAtParked() {
  looking ||= (async () => {
    for (const [id, deps] of [...parked]) {
      await lookAt(id, deps).catch((error) => log.warn('pull request checks not looked at', { planId: id, code: safeErrorCode(error) }));
    }
  })().finally(() => { looking = null; });
  return looking;
}
