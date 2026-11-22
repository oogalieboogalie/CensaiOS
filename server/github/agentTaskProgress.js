// The rules for where a coding job stands (docker/100-agent-task-tracking.sql).
// Pure: no database, no network. Facts come in from GitHub's webhook
// (agentTasks.js) or from asking GitHub (agentTaskReconcile.js); this file
// turns them into a status and one plain sentence about what the job waits for.
//
// Done means proven. A job is done only when all of these hold:
//   1. the pull request changed at least one file, or a reviewer recorded that
//      a commit on the main branch already fixes it and that commit was found there;
//   2. GitHub's whole view of the latest commit says its checks passed (the
//      catch-up reads it into checks_confirmed; single results arriving by
//      webhook are not enough, a slower check may still be running), or says
//      the repository has no checks at all, which is then said in the notice;
//   3. a review of the latest commit says it was clean (agentTaskReview.js);
//   4. a merge is recorded, with its commit.
// Anything short of that keeps its status (merged is not done) and names the gap.
import { checksState, lower, sameCommit } from './agentTaskFacts.js';

const short = (sha) => lower(sha).slice(0, 7);

/**
 * The checks word for a commit: GitHub's whole view when it has been read for
 * that commit (passed, failed, pending, or none = the repository has no
 * checks), else what single results say so far, where "passed" is only
 * "unconfirmed". null when nothing is known.
 */
export function checksFor(task, sha) {
  if (!sha || lower(task.checks_sha) !== lower(sha)) return null;
  if (task.checks_confirmed) return task.checks_confirmed;
  const seen = checksState(task.checks_detail);
  return seen === 'passed' ? 'unconfirmed' : seen;
}

function gaps(task, head, { merged }) {
  const found = [];
  const files = task.pr_changed_files;
  const fixed = task.already_fixed_state === 'verified';
  if (!fixed && files === 0) found.push(merged ? 'it changed no files' : 'the pull request changes no files');
  else if (!fixed && (files === null || files === undefined)) found.push('the size of the change is not known yet');
  const checks = checksFor(task, head);
  if (checks === 'failed') found.push('a check failed on the latest commit');
  else if (checks === 'pending') found.push(merged ? 'checks had not finished' : 'waiting for checks');
  else if (checks === 'unconfirmed') found.push('the checks seen so far passed; waiting to confirm with GitHub that all of them did');
  else if (checks !== 'passed' && checks !== 'none') found.push(merged ? 'checks unknown' : 'waiting for checks');
  if (!task.review_state || !task.review_sha) found.push(merged ? 'no independent review of the latest commit' : 'waiting for an independent review');
  else if (!head || !sameCommit(task.review_sha, head)) found.push('the review is for an older commit');
  else if (task.review_state === 'not_clean') found.push('the review of the latest commit was not clean');
  else if (task.review_state !== 'approved') found.push('the review asked for changes');
  if (merged && !task.merge_commit_sha) found.push('the merge commit is not recorded yet');
  return found;
}

const sentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

/**
 * Where a job stands: { status, blocker, checksState }. `status` is the row's
 * own, except that merged (or a confirmed "already fixed") with nothing
 * missing becomes done. `blocker` is one plain sentence, null once done.
 */
export function taskProgress(task) {
  const head = task.pr_head_sha;
  const checks = checksFor(task, head);
  if (task.status === 'done') return { status: 'done', blocker: null, checksState: checks };
  if (task.status === 'merged') {
    const missing = gaps(task, head, { merged: true });
    if (!missing.length) return { status: 'done', blocker: null, checksState: checks };
    return { status: 'merged', blocker: `Merged, but ${missing.join('; ')}.`, checksState: checks };
  }
  if (task.already_fixed_sha && task.status !== 'pr_open') {
    const sha = task.already_fixed_sha;
    const state = checksFor(task, sha);
    if (task.already_fixed_state === 'refused') {
      return { status: task.status, blocker: `A review says commit ${short(sha)} already fixes this, but that commit is not on the main branch.`, checksState: state };
    }
    if (task.already_fixed_state !== 'verified') {
      return { status: task.status, blocker: `A review says commit ${short(sha)} on the main branch already fixes this; waiting to confirm that commit is there.`, checksState: state };
    }
    const missing = gaps(task, sha, { merged: true });
    if (!missing.length) return { status: 'done', blocker: null, checksState: state };
    return { status: task.status, blocker: `Already fixed by commit ${short(sha)}, but ${missing.join('; ')}.`, checksState: state };
  }
  if (task.status === 'pr_open') {
    const missing = gaps(task, head, { merged: false });
    if (task.merge_bot_note) missing.push(`the merge-bot said: ${task.merge_bot_note.replace(/[.\s]+$/, '')}`);
    return {
      status: 'pr_open',
      blocker: missing.length ? sentence(missing.join('; ')) : 'The checks and the review of the latest commit are good: waiting for the merge.',
      checksState: checks,
    };
  }
  if (task.status === 'closed') return { status: 'closed', blocker: 'The pull request was closed without merging.', checksState: checks };
  return { status: 'open', blocker: 'Waiting for the worker to open a pull request.', checksState: checks };
}

/** What a person needs to see for one job: the link, what it waits for, when it last changed. */
export function taskView(task) {
  const stamp = (value) => (value ? new Date(value).toISOString() : null);
  return {
    task_id: String(task.id),
    task_key: task.task_key || null,
    repo: task.repo,
    issue_number: task.issue_number,
    issue_url: task.issue_url,
    worker: task.worker,
    status: task.status,
    waiting_for: task.status === 'done' ? null : (task.blocker || taskProgress(task).blocker),
    pr_number: task.pr_number ?? null,
    pr_url: task.pr_url || null,
    latest_commit: task.pr_head_sha || null,
    checks: task.checks_state || null,
    review: task.review_state || null,
    review_commit: task.review_sha || null,
    merge_commit: task.merge_commit_sha || null,
    last_update: stamp(task.updated_at),
  };
}
