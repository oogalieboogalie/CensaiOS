// ═══════════════════════════════════════════════════════════════════
//  FIX FAILING CHECKS
//  "Have an agent fix it" on a red pull request in the Inbox. Same road
//  as Fix conflicts (server/github/conflictFixer.js): a kept clone of the
//  repo, Claude Code in its own worktree at the PR's head through the
//  Agent Console, then Homebase checks the result and pushes it to the
//  PR's branch. Never force-pushes, never touches a fork.
// ═══════════════════════════════════════════════════════════════════

import crypto from 'crypto';
import { deskError } from '../github/mergeDesk.js';
import {
  ensureClone, fixRoot, publicJob, runGit, setJob, trackFixJob, watchTask,
} from '../github/conflictFixer.js';

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'cancelled', 'startup_failure']);
const MAX_DETAIL = 1500;
const MAX_ANNOTATIONS = 12;

const clip = (text, n) => {
  const s = String(text || '').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** What failed, in the words GitHub gives: check name, its summary, and file:line notes. */
export async function failingChecks(octokit, { owner, repo, sha }) {
  const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
  const failed = (data.check_runs || []).filter((r) => r.status === 'completed' && FAILED.has(r.conclusion));
  return Promise.all(failed.slice(0, 5).map(async (run) => {
    let notes = [];
    try {
      const res = await octokit.rest.checks.listAnnotations({ owner, repo, check_run_id: run.id, per_page: MAX_ANNOTATIONS });
      notes = (res.data || []).map((a) => `${a.path}:${a.start_line} ${clip(a.message, 200)}`);
    } catch { /* annotations are a bonus */ }
    return {
      name: run.name,
      url: run.html_url || run.details_url || '',
      detail: clip([run.output?.title, run.output?.summary, run.output?.text].filter(Boolean).join('\n'), MAX_DETAIL),
      notes,
    };
  }));
}

export function buildCiFixPrompt({ pr, repo, checks }) {
  const lines = [
    `The checks on pull request #${pr.number} "${pr.title}" in ${repo} are failing. Make them pass.`,
    `This folder is checked out at the PR's branch (${pr.headRef}).`,
    '',
    'What failed:',
  ];
  for (const c of checks) {
    lines.push(`- ${c.name}${c.url ? ` (${c.url})` : ''}`);
    if (c.detail) lines.push(...c.detail.split('\n').map((l) => `    ${l}`));
    for (const n of c.notes) lines.push(`    ${n}`);
  }
  if (!checks.length) lines.push('- GitHub did not say which check. Run the repo\'s own lint and tests to find it.');
  lines.push(
    '',
    '1. Reproduce the failure with the repo\'s own command (lint, typecheck or the failing test) before changing anything.',
    '2. Find the real cause and fix it in the smallest way. Never skip, disable or delete a test to get green.',
    '3. Run the same command again and make sure it passes.',
    '4. Commit with: git add -A && git commit -m "fix: make the failing checks pass"',
    '',
    'Do not push and do not rewrite history. Homebase pushes your commit when you finish.',
    'End with one plain sentence saying what was wrong and what you changed.',
  );
  return lines.join('\n');
}

/** After the agent: something new was committed on top of the PR head. Then push it. */
export async function pushCiFix({ job, task, git, token }) {
  const dir = task.worktree.dir;
  const dirty = (await git(['status', '--porcelain'], dir)).trim();
  if (dirty) {
    await git(['add', '-A'], dir);
    await git(['commit', '-m', 'fix: make the failing checks pass'], dir);
  }
  const head = (await git(['rev-parse', 'HEAD'], dir)).trim();
  if (head === job.headSha) throw deskError('The agent finished without changing anything. Open the Agent Console to see what it found.', 409);
  const onTop = await git(['merge-base', '--is-ancestor', job.headSha, 'HEAD'], dir).then(() => true, () => false);
  if (!onTop) throw deskError('The agent rewrote the branch history, so Homebase will not push it.', 409);
  await git(['push', 'origin', `HEAD:refs/heads/${job.headRef}`], dir, { token });
  return head;
}

/**
 * Start a CI fix. Resolves fast with the job; the agent part runs on and the
 * job is followed through /api/github/desk/fix/:id like a conflict fix.
 * deps: { manager, git, remoteUrl, root, canRunAgents, cli }
 */
export async function startCiFix({ octokit, token, owner, repo, number, user = {} }, deps = {}) {
  const git = deps.git || runGit;
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  if (pr.state !== 'open') throw deskError('This PR is not open anymore.', 409);
  const info = { number, title: pr.title, headRef: pr.head.ref, baseRef: pr.base.ref };
  const job = trackFixJob({
    id: crypto.randomBytes(5).toString('hex'), kind: 'ci', repo: `${owner}/${repo}`, ...info,
    by: user.name || 'Someone', startedAt: Date.now(), updatedAt: Date.now(),
    status: 'agent', text: 'Reading what failed.', taskId: null, sha: null, headSha: pr.head.sha,
  });
  if (pr.head.repo?.full_name !== pr.base.repo?.full_name) {
    return publicJob(setJob(job, { status: 'failed', text: 'This PR comes from a fork, so Homebase cannot push a fix. Fix it in the fork.' }));
  }
  if (!deps.manager || deps.canRunAgents === false) {
    return publicJob(setJob(job, { status: 'failed', text: 'Agents run on the desktop app. Open this board there and tap Fix it again.' }));
  }
  const checks = await failingChecks(octokit, { owner, repo, sha: pr.head.sha }).catch(() => []);
  setJob(job, { text: 'Getting a copy of the repo for the agent.', failing: checks.map((c) => c.name) });
  const dir = await ensureClone({ owner, repo, token, root: deps.root || fixRoot(), remoteUrl: deps.remoteUrl || `https://github.com/${owner}/${repo}.git`, git });
  await git(['fetch', 'origin', `+refs/heads/${info.headRef}:refs/remotes/origin/${info.headRef}`], dir, { token });
  const task = await deps.manager.start({
    cli: deps.cli || 'claudecode', folder: dir, prompt: buildCiFixPrompt({ pr: info, repo: job.repo, checks }),
    user, baseOverride: pr.head.sha,
  });
  const agentText = 'An agent is finding out why the checks failed and fixing it.';
  setJob(job, { taskId: task.id, token, text: agentText });
  watchTask(job, {
    manager: deps.manager, git, finish: pushCiFix, agentText,
    retryText: 'Tap Fix it to try again.', doneText: 'Fixed and pushed. Checks are running again.',
  });
  return publicJob(job);
}
