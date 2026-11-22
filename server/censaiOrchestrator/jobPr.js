// Censai the orchestrator: a code job on a GitHub project (a Kraken fix) ends in a
// pull request. Its branch is made at the pinned commit before the agent starts; once the
// rest checks out, the pull request is opened (openWorkerPr) and the job waits, parked
// (parkedChecks.js), for the checks of its branch's newest commit. Calls run as the plan's person.

import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { runAsGithubPerson } from '../github/credential.js';
import { agentName, clip } from './shape.js';

const log = createLogger('censai-orchestrator');
const configuredWait = Number(process.env.CENSAI_PR_CHECKS_WAIT_MS);
/** How long a job waits for its pull request's checks before it says where they stand. */
export const PR_CHECKS_WAIT_MS = Math.max(0, Number.isFinite(configuredWait) && configuredWait >= 0 ? configuredWait : 20 * 60 * 1000);

const PASSED = new Set(['success', 'neutral', 'skipped']);
/** The words for a pull request no check ran on (the coding-job tracker calls it "none" too). */
export const NO_CHECKS_LINE = 'No checks ran on this pull request, so nothing was tested on GitHub.';

/** Whether this job works on GitHub on a branch of its own: a code job of a plan pinned to a GitHub repo. */
export function onGithubBranch(plan, job) {
  return job?.kind === 'code' && plan?.pin?.kind === 'github' && Boolean(plan.pin.source);
}

const planJob = (plan, job) => ({ kind: 'plan_job', id: plan.id, part: job.n });
const asPerson = (plan, work) => runAsGithubPerson({ userId: plan.userId, computerKey: true }, work);

async function tools() {
  const [writeBranch, workerPr, branches, helpers] = await Promise.all([
    import('../tools/handlers/writeBranch.js'),
    import('../tools/handlers/workerPr.js'),
    import('../workspaces/workerBranches.js'),
    import('../tools/helpers.js'),
  ]);
  return { ...writeBranch, ...workerPr, ...branches, fetchGithub: helpers.fetchGithub };
}

/**
 * Make (or find) the job's branch at the pinned commit. { ok: true, branch, line } or
 * { ok: false, line } in plain words, when no branch could be made.
 */
export async function prepareJobBranch({ db, plan, job }) {
  const { jobBranchFor } = await tools();
  const repo = plan.pin.source;
  const from = plan.pin.commit || plan.pin.branch || null;
  try {
    const { branch, made } = await asPerson(plan, () => jobBranchFor({
      db, workspaceId: plan.workspaceId, agentId: job.agentId, job: planJob(plan, job), repo, from,
    }));
    const where = plan.pin.commit ? `the commit you looked at (${plan.pin.commit.slice(0, 7)})` : from ? `"${from}"` : 'the main branch';
    return { ok: true, branch, line: made ? `Made the branch ${branch} from ${where}` : `Working on the branch ${branch}` };
  } catch (error) {
    if (error?.code !== 'JOB_BRANCH_BLOCKED') throw error;
    return { ok: false, line: error.message };
  }
}

/**
 * What GitHub says of the checks on exactly one commit: { state: 'passed' | 'failed' | 'running' | 'none', failed }.
 * A check run GitHub files under another commit is not counted.
 */
export async function checksOn(repo, sha, fetchGithub) {
  const [runs, status] = await Promise.all([
    fetchGithub(`/repos/${repo}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`),
    fetchGithub(`/repos/${repo}/commits/${encodeURIComponent(sha)}/status`),
  ]);
  const checks = [
    ...(Array.isArray(runs?.check_runs) ? runs.check_runs : [])
      .filter((run) => !run.head_sha || run.head_sha === sha)
      .map((run) => ({ name: run.name, done: run.status === 'completed', ok: PASSED.has(run.conclusion) })),
    ...(status?.sha && status.sha !== sha ? [] : Array.isArray(status?.statuses) ? status.statuses : []).map((entry) => ({
      name: entry.context, done: entry.state !== 'pending', ok: entry.state === 'success',
    })),
  ];
  if (!checks.length) return { state: 'none', failed: [] };
  const failed = checks.filter((check) => check.done && !check.ok).map((check) => String(check.name || 'a check'));
  if (failed.length) return { state: 'failed', failed };
  return { state: checks.every((check) => check.done) ? 'passed' : 'running', failed: [] };
}

function prBody(plan, job) {
  return [
    `Censai handed this to ${agentName(job.agentId)}: ${clip(job.task, 1500)}`,
    '',
    'What had to be true:',
    ...(job.checklist || []).map((item) => `- ${item.text}`),
    '',
    'Opened by Censai, the orchestrator, from the job\'s own branch.',
  ].join('\n');
}

/**
 * Open the job's pull request (or find the one the agent opened) and note it with the
 * commit its branch is at. { open: true, pr, line }, or { ok: false | null, line } when it
 * could not be opened (false: sending the work back can fix it).
 */
export async function openJobPr({ db, plan, job }) {
  if (!onGithubBranch(plan, job)) return { ok: null, line: 'This job has no project on GitHub to open a pull request in.' };
  const { findWorkerBranch, openWorkerPr } = await tools();
  const repo = plan.pin.source;
  const ids = planJob(plan, job);
  const meta = { planId: plan.id, part: job.n, agentId: job.agentId };
  return asPerson(plan, async () => {
    const branch = (await findWorkerBranch(db, ids, repo))?.branch;
    if (!branch) return { ok: false, line: `${agentName(job.agentId)}'s job has no branch on GitHub, so there is no pull request to open.` };
    let pr;
    try {
      ({ pr } = await openWorkerPr({
        db, workspaceId: plan.workspaceId, agentId: job.agentId, job: ids, project: { repo }, branch,
        title: clip(plan.goal, 200), body: prBody(plan, job),
      }));
    } catch (error) {
      if (error?.code === 'JOB_BRANCH_BLOCKED') return { ok: false, line: error.message };
      log.warn('pull request not opened', { ...meta, code: safeErrorCode(error) });
      return { ok: null, line: 'I could not open the pull request: GitHub did not answer as expected.' };
    }
    log.info('job pull request open', { ...meta, pr: pr.number });
    if (!pr.headSha) return { ok: null, line: `Pull request #${pr.number} is open, but GitHub did not say which commit its branch is at, so its checks cannot be read.` };
    return { open: true, pr, line: `Pull request #${pr.number} is open. Waiting for its checks on GitHub.` };
  });
}

/**
 * One look at the checks of the commit the job is waiting on (job.prWait). Answers
 * { state, final, line, detail }: final false means look again later. A pull request with no
 * checks keeps waiting the whole wait (a status or an outside check can come late); still none
 * then is its own state, 'none', never "passed".
 */
export async function readJobChecks({ plan, job, now = Date.now() }) {
  const { fetchGithub } = await tools();
  const wait = job.prWait || {};
  const repo = plan.pin.source;
  const opened = `Pull request #${wait.number}`;
  const over = now >= Number(wait.until || 0);
  const minutes = Math.max(1, Math.round((Number(wait.until || 0) - Number(wait.since || 0)) / 60000));
  return asPerson(plan, async () => {
    let seen;
    try {
      seen = await checksOn(repo, wait.sha, fetchGithub);
    } catch (error) {
      log.warn('pull request checks not read', { planId: plan.id, part: job.n, code: safeErrorCode(error) });
      return { state: 'unreadable', final: over, line: `${opened} is open, but its checks on GitHub could not be read.` };
    }
    if (seen.state === 'passed') return { state: 'passed', final: true, line: `${opened} is open and its checks on GitHub passed.` };
    if (seen.state === 'failed') {
      const names = seen.failed.slice(0, 5).join(', ');
      return { state: 'failed', final: true, line: `${opened} is open, and its checks on GitHub failed: ${names}.`, detail: `Failed checks: ${names}` };
    }
    if (seen.state === 'none' && over) {
      return { state: 'none', final: true, line: `${opened} is open. ${NO_CHECKS_LINE}` };
    }
    if (seen.state === 'none') return { state: 'running', final: false, line: `${opened} is open. Waiting for its checks on GitHub to start.` };
    return { state: 'running', final: over, line: over ? `${opened} is open, and its checks on GitHub were still running after ${minutes} minutes.` : `${opened} is open. Its checks on GitHub are running.` };
  });
}
