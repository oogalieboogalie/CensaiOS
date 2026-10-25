// ═══════════════════════════════════════════════════════════════════
//  REVIEW TEAM
//  "Review" on a PR in the GitHub window. The coding CLIs the person
//  picks (Claude Code, Codex, Gemini CLI, Grok, ...) each read the PR in
//  their own worktree through the Agent Console, on that person's own
//  sign-in or key, so there is no per-review API bill from censaiOS.
//  Their findings are merged (same spot = one finding, "found by 2") and
//  can be posted to GitHub as one review in one tap.
// ═══════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { deskError } from './mergeDesk.js';
import { runGit, fixRoot, ensureClone, setJob } from './conflictFixer.js';
import { prepareDiff, commentableLines, placeFindings, splitDiff } from './reviewCore.js';
import { DIFF_FILE, buildReviewPrompt, parseReviewText, mergeFindings, formatTeamFinding, formatTeamSummary } from './reviewMerge.js';
import { getAdapter } from '../cli-agents/adapters/index.js';

const POLL_MS = 2000;
const MAX_JOBS = 30;
export const MAX_REVIEWERS = 4;
const ACTIVE = new Set(['starting', 'installing', 'running', 'needs_approval']);
const jobs = new Map();

export function publicReview(job) {
  const { token: _t, timer: _timer, lines: _lines, userId: _userId, ...rest } = job;
  return rest;
}

export function getReview(id) {
  const job = jobs.get(String(id || ''));
  if (!job) throw deskError('That review is no longer here. Tap Review again.', 404);
  return job;
}

/** The last thing the CLI said, in full (task.summary is clipped). */
export function finalText(task) {
  for (let i = task.items.length - 1; i >= 0; i -= 1) {
    const item = task.items[i];
    if (item.kind === 'message' && item.role === 'assistant' && item.text?.trim()) return item.text;
  }
  return task.summary || '';
}

/** Pending agent approvals across the team, in the window's words. */
export function reviewApprovals(job, manager) {
  const out = [];
  for (const r of job.reviewers) {
    if (!r.taskId) continue;
    try {
      for (const p of manager.get(r.taskId).permissions.filter((x) => x.status === 'pending')) {
        out.push({ id: p.id, taskId: r.taskId, reviewer: r.label, title: p.title, detail: String(p.detail || '').slice(0, 300) });
      }
    } catch { /* task gone */ }
  }
  return out;
}

/** One poll: update each reviewer from its task, merge when all are finished. */
export function refreshReview(job, manager) {
  for (const r of job.reviewers) {
    if (!r.taskId || r.status === 'done' || r.status === 'failed') continue;
    let task;
    try { task = manager.get(r.taskId); } catch { task = null; }
    if (!task) { Object.assign(r, { status: 'failed', error: 'The task was discarded.' }); continue; }
    if (ACTIVE.has(task.status)) { r.status = task.status === 'needs_approval' ? 'needs_approval' : 'reviewing'; continue; }
    const parsed = task.status === 'done' ? parseReviewText(finalText(task)) : null;
    if (parsed) Object.assign(r, { status: 'done', summary: parsed.summary, findings: parsed.findings, costUsd: task.costUsd ?? null });
    else Object.assign(r, { status: 'failed', error: task.status === 'done' ? 'It finished without a findings list.' : `It stopped (${task.status}). Open the Agent Console to see why.` });
  }
  const working = job.reviewers.filter((r) => r.status !== 'done' && r.status !== 'failed');
  if (working.length) {
    setJob(job, { status: 'reviewing', text: `${working.length} of ${job.reviewers.length} reviewers still reading.` });
    return false;
  }
  const done = job.reviewers.filter((r) => r.status === 'done');
  const findings = mergeFindings(done.map((r) => ({ reviewer: r.label, findings: r.findings })));
  setJob(job, {
    status: done.length ? 'done' : 'failed', findings,
    text: done.length ? (findings.length ? `${findings.length} possible bug${findings.length === 1 ? '' : 's'} found.` : 'No real bugs found.') : 'No reviewer finished. Open the Agent Console to see why.',
  });
  return true;
}

export function watchReview(job, manager, pollMs = POLL_MS) {
  job.timer = setInterval(() => {
    if (refreshReview(job, manager)) clearInterval(job.timer);
  }, pollMs);
  job.timer.unref?.();
}

/**
 * Start a review. Resolves once every reviewer's task is started.
 * deps: { manager, canRunAgents, git, root, remoteUrl, pollMs }
 */
export async function startReview({ octokit, token, owner, repo, number, reviewers = [], user = {} }, deps = {}) {
  const ids = [...new Set((Array.isArray(reviewers) ? reviewers : []).map((id) => String(id).toLowerCase()))].filter((id) => getAdapter(id) && !getAdapter(id).noReadOnly);
  if (!ids.length) throw deskError('Pick at least one reviewer.', 400);
  if (ids.length > MAX_REVIEWERS) throw deskError(`Pick up to ${MAX_REVIEWERS} reviewers.`, 400);
  if (!deps.manager || deps.canRunAgents === false) throw deskError('Reviewers run on the desktop app, so open the board there and tap Review.', 409);
  const git = deps.git || runGit;
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  const info = { number, title: pr.title, headRef: pr.head.ref, baseRef: pr.base.ref };
  const fullRepo = `${owner}/${repo}`;
  // refs/pull/N/head works for PRs from forks too: reviewing never pushes.
  const dir = await ensureClone({ owner, repo, token, root: deps.root || fixRoot(), remoteUrl: deps.remoteUrl || `https://github.com/${fullRepo}.git`, git });
  await git(['fetch', 'origin', `+refs/heads/${info.baseRef}:refs/remotes/origin/${info.baseRef}`, `+refs/pull/${number}/head:refs/remotes/origin/pr-${number}`], dir, { token });
  const headSha = (await git(['rev-parse', `origin/pr-${number}`], dir)).trim();
  const raw = await git(['diff', '--no-color', '--unified=5', `origin/${info.baseRef}...${headSha}`], dir);
  const prepared = prepareDiff(raw, { maxChars: 400000, maxFileChars: 60000 });
  const lines = Object.fromEntries([...commentableLines(prepared.diff)].map(([p, set]) => [p, [...set]]));
  const prompt = buildReviewPrompt({ pr: info, repo: fullRepo, files: splitDiff(raw).map((f) => f.path), skipped: prepared.skipped });

  const job = {
    id: crypto.randomBytes(5).toString('hex'), repo: fullRepo, ...info, headSha,
    by: user.name || 'Someone', userId: user.userId ?? null, startedAt: Date.now(), updatedAt: Date.now(),
    status: 'reviewing', text: 'Reviewers are reading the change.', findings: [], posted: null, lines,
    reviewers: ids.map((id) => ({ cli: id, label: getAdapter(id).label, taskId: null, status: 'starting', summary: null, findings: [], error: null })),
  };
  if (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value);
  jobs.set(job.id, job);

  const writeDiff = (worktreeDir) => {
    const file = path.join(worktreeDir, DIFF_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, prepared.diff);
  };
  for (const r of job.reviewers) {
    try {
      const task = await deps.manager.start({ cli: r.cli, folder: dir, prompt, user, baseOverride: headSha, title: `Review PR #${number}: ${info.title}`.slice(0, 80), prepare: writeDiff, readOnly: true });
      r.taskId = task.id;
      r.status = 'reviewing';
    } catch (err) {
      Object.assign(r, { status: 'failed', error: err.message });
    }
  }
  if (!refreshReview(job, deps.manager)) watchReview(job, deps.manager, deps.pollMs);
  return publicReview(job);
}

/** Post the merged findings to GitHub as one review (inline where GitHub allows). */
export async function postReview(job, { octokit }) {
  if (job.status !== 'done') throw deskError('Wait for the reviewers to finish first.', 409);
  const [owner, repo] = job.repo.split('/');
  const lines = new Map(Object.entries(job.lines || {}).map(([p, list]) => [p, new Set(list)]));
  const { inline, elsewhere } = placeFindings(job.findings, lines);
  const done = job.reviewers.filter((r) => r.status === 'done');
  const args = { reviewers: done.map((r) => r.label), summaries: done.map((r) => ({ reviewer: r.label, summary: r.summary })) };
  const base = { owner, repo, pull_number: job.number, commit_id: job.headSha, event: 'COMMENT' };
  let data;
  try {
    ({ data } = await octokit.rest.pulls.createReview({
      ...base, body: formatTeamSummary({ ...args, inline, elsewhere }),
      comments: inline.map((f) => ({ path: f.path, line: f.line, side: 'RIGHT', body: formatTeamFinding(f) })),
    }));
  } catch (err) {
    if (err.status !== 422 || !inline.length) throw err;
    ({ data } = await octokit.rest.pulls.createReview({ ...base, body: formatTeamSummary({ ...args, inline: [], elsewhere: [...inline, ...elsewhere] }) }));
  }
  setJob(job, { posted: { url: data?.html_url || null, at: Date.now() }, text: 'Posted to GitHub.' });
  return publicReview(job);
}

/** Test helper. */
export function resetReviews() {
  for (const job of jobs.values()) clearInterval(job.timer);
  jobs.clear();
}
