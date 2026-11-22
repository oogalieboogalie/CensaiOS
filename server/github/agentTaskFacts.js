// What GitHub says about a coding job's pull request and its checks, in the few
// facts the tracker keeps (agentTaskProgress.js has the rules that read them).
// Pure: no database, no network.
import { taskKeysIn } from './taskMarker.js';

export const TASK_WORKER_BRANCH = /^(grok|claude)\//i;
const ISSUE_BRANCH = /^(grok|claude)\/issue-(\d{1,9})-/i;
const FAILED = new Set(['failure', 'timed_out', 'action_required', 'cancelled', 'startup_failure', 'stale', 'error']);
const MOST_CHECKS = 60;

export const clean = (value) => String(value ?? '').trim();
export const lower = (value) => clean(value).toLowerCase();

/** True when a named commit (7 to 40 characters) is the given full commit. */
export function sameCommit(named, full) {
  const a = lower(named);
  const b = lower(full);
  if (a.length < 7 || b.length < 7) return false;
  return a.length <= b.length ? b.startsWith(a) : a.startsWith(b);
}

/**
 * A pull request as GitHub sends it (webhook) or returns it (REST), in the
 * few facts the tracker keeps. `action` is the webhook's, when there is one.
 */
export function pullFacts(pr = {}, { repo = '', action = '' } = {}) {
  const head = pr.head || {};
  const merged = pr.merged === true || Boolean(pr.merged_at);
  const state = merged ? 'merged' : (pr.state === 'closed' || action === 'closed') ? 'closed' : 'open';
  const home = lower(repo || pr.base?.repo?.full_name);
  // A pull request from a fork (or a deleted fork, head.repo null) can't claim a job:
  // the workers push their branches to the job's own repository.
  const sameRepo = !('repo' in head) || (Boolean(home) && lower(head.repo?.full_name) === home);
  const mergeSha = lower(pr.merge_commit_sha);
  return {
    number: Number(pr.number) || null,
    url: clean(pr.html_url) || null,
    state,
    sameRepo,
    branch: clean(head.ref),
    headSha: /^[0-9a-f]{40}$/.test(lower(head.sha)) ? lower(head.sha) : null,
    body: String(pr.body ?? ''),
    createdAt: clean(pr.created_at) || null,
    changedFiles: Number.isInteger(pr.changed_files) ? pr.changed_files : null,
    // Before a merge GitHub keeps a trial merge in this field; it only counts once merged.
    mergeCommitSha: merged && /^[0-9a-f]{40}$/.test(mergeSha) ? mergeSha : null,
  };
}

/**
 * What a pull request may claim. Only a branch under a worker's own name
 * (grok/... or claude/...) claims anything: by the job key in its marker line
 * (taskMarker.js), or by the old branch form <worker>/issue-<n>-. A "Fixes #N"
 * line is never enough.
 */
export function pullClaim(pull = {}) {
  const prefix = TASK_WORKER_BRANCH.exec(pull.branch || '');
  if (!prefix || pull.sameRepo === false) return null;
  const issue = ISSUE_BRANCH.exec(pull.branch || '');
  const issueNumber = issue ? Number(issue[2]) : null;
  return {
    worker: prefix[1].toLowerCase(),
    taskKeys: taskKeysIn(pull.body),
    issueNumber: Number.isInteger(issueNumber) && issueNumber > 0 ? issueNumber : null,
  };
}

/**
 * Whether this pull request is this job's: already linked, or claimed by its
 * own worker's branch with the job's own key (or the old issue branch). The
 * caller has already matched the repository. The key is random and kept on
 * the row, so a job on another install, or a counter that started again
 * after a reset, can never match. A pull request opened before the job was
 * filed cannot be its work.
 */
export function pullIsFor(task, pull, claim = pullClaim(pull)) {
  if (pull.sameRepo === false) return false;
  if (pull.number && Number(task.pr_number) === pull.number) return true;
  if (!claim || lower(task.worker) !== claim.worker) return false;
  if (pull.createdAt && task.created_at && new Date(pull.createdAt) < new Date(task.created_at)) return false;
  const key = lower(task.task_key);
  return (Boolean(key) && claim.taskKeys.includes(key)) || (claim.issueNumber !== null && Number(task.issue_number) === claim.issueNumber);
}

/** The changes a pull request's state makes to a job, or null when it may not move it. */
export function pullPatch(task, pull, { now = new Date() } = {}) {
  if (task.status === 'done') return null;
  const mine = Number(task.pr_number) === pull.number;
  let status;
  if (pull.state === 'merged') {
    if (task.status === 'merged' && !mine) return null;
    status = 'merged';
  } else if (pull.state === 'open') {
    // A merged job stays merged, and an open pull request is not replaced by a second one.
    if (task.status === 'merged' || (task.status === 'pr_open' && !mine)) return null;
    status = 'pr_open';
  } else {
    if (!(mine && (task.status === 'pr_open' || task.status === 'closed'))) return null;
    status = 'closed';
  }
  const patch = { status, pr_number: pull.number, pr_url: pull.url };
  if (pull.changedFiles !== null) patch.pr_changed_files = pull.changedFiles;
  if (pull.mergeCommitSha) patch.merge_commit_sha = pull.mergeCommitSha;
  if (!mine) Object.assign(patch, { review_state: null, review_sha: null, review_at: null, review_kind: null });
  if (pull.headSha && (!mine || lower(task.pr_head_sha) !== pull.headSha)) {
    // New commits: the checks and the merge-bot's last word were about the old one.
    Object.assign(patch, {
      pr_head_sha: pull.headSha, pr_head_at: now.toISOString(),
      checks_sha: pull.headSha, checks_detail: {}, checks_confirmed: null, merge_bot_note: null,
    });
  }
  return patch;
}

function outcome({ status, conclusion, state }) {
  const word = lower(conclusion || state);
  if (status && lower(status) !== 'completed' && !word) return 'pending';
  if (!word || word === 'pending') return 'pending';
  return FAILED.has(word) ? 'failed' : 'passed';
}

/** One check result from a check_run, check_suite or status delivery: { sha, key, outcome }, or null. */
export function checkFact(event, payload = {}) {
  let sha;
  let key;
  let result;
  if (event === 'check_run') {
    const run = payload.check_run || {};
    sha = run.head_sha;
    key = `run:${clean(run.name)}`;
    result = outcome(run);
  } else if (event === 'check_suite') {
    // A suite that never reports stays queued for ever, so only a finished one counts.
    const suite = payload.check_suite || {};
    if (lower(suite.status) !== 'completed') return null;
    sha = suite.head_sha;
    key = `suite:${clean(suite.id)}`;
    result = outcome(suite);
  } else if (event === 'status') {
    sha = payload.sha;
    key = `status:${clean(payload.context)}`;
    result = outcome({ state: payload.state });
  } else return null;
  if (!/^[0-9a-f]{40}$/.test(lower(sha)) || key.endsWith(':')) return null;
  return { sha: lower(sha), key: key.slice(0, 120), outcome: result };
}

/** Check runs as GitHub lists them for a commit, as the stored map (latest run of each name). */
export function checksDetail(runs = []) {
  const latest = new Map();
  for (const run of runs) {
    const name = clean(run?.name);
    if (!name) continue;
    const at = clean(run.completed_at || run.started_at);
    const seen = latest.get(name);
    if (!seen || at >= seen.at) latest.set(name, { at, result: outcome(run) });
  }
  const detail = {};
  for (const [name, { result }] of [...latest].slice(0, MOST_CHECKS)) detail[`run:${name}`.slice(0, 120)] = result;
  return detail;
}

/**
 * passed, failed or pending for the results seen so far; null when none has
 * reported. "passed" here only means nothing seen failed: slower checks may
 * not have reported yet, so it never finishes a job by itself
 * (agentTaskProgress.js waits for GitHub's whole view, checks_confirmed).
 */
export function checksState(detail) {
  const results = Object.values(detail && typeof detail === 'object' ? detail : {});
  if (!results.length) return null;
  if (results.includes('failed')) return 'failed';
  return results.includes('pending') ? 'pending' : 'passed';
}

/** The changes one check result makes to a job. */
export function checkPatch(task, fact) {
  const fresh = lower(task.checks_sha) === fact.sha ? { ...(task.checks_detail || {}) } : {};
  if (!(fact.key in fresh) && Object.keys(fresh).length >= MOST_CHECKS) return null;
  fresh[fact.key] = fact.outcome;
  // A new result means GitHub's whole view has to be read again.
  return { checks_sha: fact.sha, checks_detail: fresh, checks_confirmed: null };
}
