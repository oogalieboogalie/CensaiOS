// ═══════════════════════════════════════════════════════════════════
//  FIX CONFLICTS
//  "Fix conflicts" in the GitHub window. First GitHub's own Update
//  branch (works whenever no hand edits are needed). When the PR has
//  real conflicts, Homebase keeps a clone of the repo, hands the merge
//  to Claude Code through the Agent Console (its own worktree, its
//  approvals show in the GitHub window too), then checks the result and
//  pushes it to the PR's branch. Never force-pushes.
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { updateBranch, deskError } from './mergeDesk.js';
import { githubGitUrl } from './apiUrl.js';
import { permissionForViewer } from '../cli-agents/ownerOnlySteps.js';
import { taskHiddenWords, teammateSummary } from '../cli-agents/taskHiddenWords.js';

const POLL_MS = 1500;
const MAX_JOBS = 50;
const jobs = new Map();

export function runGit(args, cwd, { token = '' } = {}) {
  const auth = token ? ['-c', `http.extraHeader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`] : [];
  return new Promise((resolve, reject) => {
    execFile('git', [...auth, ...args], { cwd, maxBuffer: 20 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      if (err) {
        const text = String(stderr || err.message).replaceAll(token || '\u0000', '***').trim().split('\n').slice(-3).join(' ');
        reject(Object.assign(new Error(text || 'git failed'), { code: err.code }));
      } else resolve(String(stdout));
    });
  });
}

export function fixRoot(env = process.env) {
  return env.CENSAI_GITHUB_FIX_DIR ? path.resolve(env.CENSAI_GITHUB_FIX_DIR) : path.join(os.homedir(), '.censai', 'github-fixes');
}

export function buildFixPrompt({ pr, repo }) {
  return [
    `Fix the merge conflicts on pull request #${pr.number} "${pr.title}" in ${repo}.`,
    `This folder is checked out at the PR's branch (${pr.headRef}).`,
    '',
    `1. Run: git merge --no-edit origin/${pr.baseRef}`,
    '2. Resolve every conflict so both sides keep working. Keep the intent of both changes; only drop one side when the other plainly replaces it.',
    '   For lockfiles, take the base branch version unless the PR added a dependency, then regenerate with the package manager.',
    '3. Make sure no conflict markers remain, then run: git add -A && git commit --no-edit',
    "4. If the repo has a quick check (lint or the tests for the files you touched), run it.",
    '',
    'Do not push and do not rewrite history. Homebase pushes your merge commit when you finish.',
    'End with one plain sentence saying what you kept from each side.',
  ].join('\n');
}

export function publicJob(job) {
  const { token: _token, timer: _timer, ...rest } = job;
  return rest;
}

export function setJob(job, patch) {
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function getFixJob(id) {
  const job = jobs.get(String(id || ''));
  if (!job) throw deskError('That fix is no longer running. Tap Fix conflicts again.', 404);
  return publicJob(job);
}

/**
 * Pending agent approvals for a job, in the window's words: as a teammate
 * sees them, as the window is on the shared board. `owner`: the whole
 * requests, for this computer's owner's own screen, never for the board.
 */
export function fixApprovals(job, manager, { owner = false } = {}) {
  if (!job.taskId) return [];
  try {
    const task = manager.get(job.taskId);
    const shown = owner ? { owner: true } : { root: task.worktree?.dir || '', hidden: taskHiddenWords(task) };
    return task.permissions
      .filter((p) => p.status === 'pending')
      .map((p) => permissionForViewer(p, shown))
      .map((p) => ({ id: p.id, title: p.title, detail: String(p.detail || '').slice(0, owner ? 2000 : 300) }));
  } catch {
    return [];
  }
}

export async function ensureClone({ owner, repo, token, root, remoteUrl, git }) {
  const dir = path.join(root, `${owner}__${repo}`.replace(/[^A-Za-z0-9._-]/g, '-'));
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(root, { recursive: true });
    await git(['clone', '--no-checkout', remoteUrl, dir], root, { token });
    await git(['config', 'user.name', 'Censai merge helper'], dir);
    await git(['config', 'user.email', 'merge-helper@censai.local'], dir);
  }
  return dir;
}

/** After the agent: merge finished, base included, no markers. Then push. */
export async function finishAndPush({ job, task, git, token }) {
  const dir = task.worktree.dir;
  const midMerge = await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], dir).then(() => true, () => false);
  if (midMerge) {
    // Files still marked unmerged are fine if the agent fixed them but skipped `git add`.
    const unmerged = (await git(['diff', '--name-only', '--diff-filter=U'], dir)).trim().split('\n').filter(Boolean);
    const left = unmerged.filter((file) => fs.existsSync(path.join(dir, file)) && /^(<<<<<<<|>>>>>>>) /m.test(fs.readFileSync(path.join(dir, file), 'utf8')));
    if (left.length) throw deskError(`The agent stopped with conflicts left in: ${left.join(', ')}.`, 409);
    await git(['add', '-A'], dir);
    await git(['commit', '--no-edit'], dir);
  }
  const included = await git(['merge-base', '--is-ancestor', `origin/${job.baseRef}`, 'HEAD'], dir).then(() => true, () => false);
  if (!included) throw deskError(`The agent finished without merging ${job.baseRef} in. Open the Agent Console to see what it did.`, 409);
  const markers = await git(['grep', '-n', '-E', '^(<<<<<<<|>>>>>>>) ', 'HEAD', '--'], dir).then((out) => out.trim(), () => '');
  if (markers) throw deskError(`Conflict markers are still in ${markers.split('\n')[0].split(':')[1] || 'a file'}. Not pushing.`, 409);
  await git(['push', 'origin', `HEAD:refs/heads/${job.headRef}`], dir, { token });
  return (await git(['rev-parse', 'HEAD'], dir)).trim();
}

const AGENT_TEXT = 'An agent is merging master in and resolving conflicts.';
const RETRY_TEXT = 'Tap Fix conflicts to try again.';

/** Keep a job so /desk/fix/:id can follow it (the CI fixer in server/inbox uses this too). */
export function trackFixJob(job) {
  if (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value);
  jobs.set(job.id, job);
  return job;
}

export function watchTask(job, { manager, git, finish = finishAndPush, agentText = AGENT_TEXT, retryText = RETRY_TEXT, doneText = 'Fixed and pushed. Checks are re-running; Merge turns on when they pass.' }) {
  job.timer = setInterval(async () => {
    let task;
    try { task = manager.get(job.taskId); } catch { task = null; }
    if (!task) {
      clearInterval(job.timer);
      setJob(job, { status: 'failed', text: 'The agent task was discarded before it finished.' });
      return;
    }
    if (task.status === 'needs_approval') setJob(job, { status: 'needs_approval', text: 'The agent wants your OK to continue.' });
    else if (task.status === 'running' || task.status === 'starting' || task.status === 'installing') setJob(job, { status: 'agent', text: agentText });
    if (task.status === 'running' || task.status === 'starting' || task.status === 'installing' || task.status === 'needs_approval') return;
    clearInterval(job.timer);
    if (task.status !== 'done') {
      setJob(job, { status: 'failed', text: task.status === 'stopped' ? `The agent was stopped. ${retryText}` : 'The agent could not finish. Open the Agent Console to see why.' });
      return;
    }
    setJob(job, { status: 'pushing', text: 'Checking the agent’s merge and pushing it.' });
    try {
      const sha = await finish({ job, task, git, token: job.token });
      // The summary shows on the shared board, so it is the one a teammate sees.
      setJob(job, { status: 'done', sha, agentSummary: teammateSummary(task) || null, text: doneText });
    } catch (err) {
      setJob(job, { status: 'failed', text: err.message });
    } finally {
      job.token = '';
    }
  }, POLL_MS);
  job.timer.unref?.();
}

/**
 * Start a fix. Resolves fast with the job; the agent part runs on.
 * deps: { manager (Agent Console task manager), git, remoteUrl, root, canRunAgents }
 */
export async function startFix({ octokit, token, owner, repo, number, user = {} }, deps = {}) {
  const git = deps.git || runGit;
  const root = deps.root || fixRoot();
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  if (pr.state !== 'open') throw deskError('This PR is not open anymore.', 409);
  const info = { number, title: pr.title, headRef: pr.head.ref, baseRef: pr.base.ref };
  const job = {
    id: crypto.randomBytes(5).toString('hex'), repo: `${owner}/${repo}`, ...info,
    by: user.name || 'Someone', startedAt: Date.now(), updatedAt: Date.now(),
    status: 'updating', text: `Bringing ${info.baseRef} into this PR.`, taskId: null, sha: null,
  };
  trackFixJob(job);

  const update = await updateBranch(octokit, { owner, repo, number, headSha: pr.head.sha });
  if (update.updated) {
    return publicJob(setJob(job, { status: 'done', text: update.nothingToDo ? 'Already up to date. No conflicts to fix.' : `Merged ${info.baseRef} in with no hand edits. Checks are re-running.` }));
  }
  if (pr.head.repo?.full_name !== pr.base.repo?.full_name) {
    return publicJob(setJob(job, { status: 'failed', text: 'This PR comes from a fork, so Homebase cannot push the fix. Fix it in the fork.' }));
  }
  if (!deps.manager || deps.canRunAgents === false) {
    return publicJob(setJob(job, { status: 'failed', text: 'This PR has real conflicts. Agents run on the desktop app, so open the board there and tap Fix conflicts.' }));
  }

  setJob(job, { status: 'agent', text: 'Getting a copy of the repo for the agent.' });
  const remoteUrl = deps.remoteUrl || githubGitUrl(`${owner}/${repo}`);
  const dir = await ensureClone({ owner, repo, token, root, remoteUrl, git });
  await git(['fetch', 'origin', `+refs/heads/${info.baseRef}:refs/remotes/origin/${info.baseRef}`, `+refs/heads/${info.headRef}:refs/remotes/origin/${info.headRef}`], dir, { token });
  const headSha = (await git(['rev-parse', `origin/${info.headRef}`], dir)).trim();
  const task = await deps.manager.start({
    cli: deps.cli || 'claudecode', folder: dir, prompt: buildFixPrompt({ pr: info, repo: job.repo }),
    user, baseOverride: headSha,
  });
  setJob(job, { taskId: task.id, token, text: AGENT_TEXT });
  watchTask(job, { manager: deps.manager, git });
  return publicJob(job);
}

/** Test helper: forget every job and stop their timers. */
export function resetFixJobs() {
  for (const job of jobs.values()) clearInterval(job.timer);
  jobs.clear();
}

export function rawFixJob(id) {
  return jobs.get(String(id || '')) || null;
}
