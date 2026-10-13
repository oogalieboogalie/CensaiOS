// ═══════════════════════════════════════════════════════════════════
//  MERGE DESK
//  What the GitHub window shows and does: every open pull request in
//  plain words (checks, draft, conflicts, who, what) and a one-tap merge
//  that marks a draft ready, merges with the repo's own method and
//  waits out a just-finished check. REST for everything except "ready
//  for review", which only GitHub's GraphQL API can do.
// ═══════════════════════════════════════════════════════════════════

import { Octokit } from '@octokit/rest';
import { getSecret } from '../secrets.js';

const MAX_PRS = 40;
const DETAIL_CONCURRENCY = 6;
const RECENT_MERGES = 8;

/** The user's own token (Settings or the window's token field) first, then GITHUB_TOKEN. */
export async function resolveGithubToken(userId, { loadUserKey } = {}) {
  const load = loadUserKey || (async (id) => {
    const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
    return getUserApiKeyConfig(id, 'github');
  });
  try {
    const userKey = userId ? await load(userId) : null;
    if (userKey?.apiKey) return { token: userKey.apiKey, source: 'byok' };
  } catch {
    // A vault read failure falls through to the server token.
  }
  const serverToken = getSecret('GITHUB_TOKEN');
  if (serverToken) return { token: serverToken, source: 'server' };
  return { token: '', source: null };
}

export function deskError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function createOctokit(token) {
  if (!token) throw deskError('Connect GitHub first: paste a token in this window.', 401);
  return new Octokit({ auth: token, userAgent: 'Censai-App' });
}

const FAILED = new Set(['failure', 'timed_out', 'action_required', 'cancelled', 'startup_failure', 'stale']);

/**
 * Fold check runs and commit statuses into one plain answer.
 * `ignore` drops checks that only exist while a PR is a draft (the WIP app),
 * since Merge marks the PR ready first.
 */
export function summarizeChecks(checkRuns = [], statuses = [], { ignore = () => false } = {}) {
  const latest = new Map();
  for (const s of statuses) if (!latest.has(s.context)) latest.set(s.context, s); // newest first
  const items = [
    ...checkRuns.map((r) => ({
      name: r.name,
      state: r.status !== 'completed' ? 'running' : FAILED.has(r.conclusion) ? 'failed' : 'passed',
    })),
    ...[...latest.values()].map((s) => ({
      name: s.context,
      state: s.state === 'pending' ? 'running' : s.state === 'success' ? 'passed' : 'failed',
    })),
  ].filter((c) => !ignore(c.name));
  const failing = items.filter((c) => c.state === 'failed').map((c) => c.name);
  const running = items.filter((c) => c.state === 'running').map((c) => c.name);
  if (!items.length) return { state: 'none', text: 'No checks', failing, running, total: 0 };
  if (failing.length) return { state: 'failed', text: failing.length === 1 ? `${failing[0]} failed` : `${failing.length} checks failed`, failing, running, total: items.length };
  if (running.length) return { state: 'running', text: 'Checks running', failing, running, total: items.length };
  return { state: 'passed', text: 'Checks passed', failing, running, total: items.length };
}

/** One readable line from a PR body: no comments, attribution, headings or markdown noise. */
export function summarizeBody(body, fallback = '') {
  const text = String(body || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^_?requested by/i.test(line) && !/^#{1,6}\s/.test(line) && !/^(---|\*\*\*|```)/.test(line) && !/^https?:\/\/\S+$/.test(line))
    .map((line) => line.replace(/^(before|after):\s*/i, '').replace(/^[-*>]\s+/, '').replace(/[*_`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
    .find((line) => line.length > 12);
  const one = (text || fallback).trim();
  const sentence = one.match(/^.{20,160}?[.!?](\s|$)/)?.[0]?.trim() || one;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}…` : sentence;
}

/** Plain status for one PR from the full `pulls.get` payload plus its checks. */
export function describePr(pr, checks) {
  const conflicts = pr.mergeable === false || pr.mergeable_state === 'dirty';
  const size = { files: pr.changed_files ?? null, additions: pr.additions ?? null, deletions: pr.deletions ?? null };
  const sizeText = size.files != null ? `Changes ${size.files} file${size.files === 1 ? '' : 's'} (+${size.additions} −${size.deletions})` : '';
  const ready = !conflicts && (checks.state === 'passed' || checks.state === 'none') && pr.mergeable !== null;
  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user?.login || 'someone',
    draft: Boolean(pr.draft),
    summary: summarizeBody(pr.body, sizeText),
    size,
    headRef: pr.head?.ref || '',
    baseRef: pr.base?.ref || '',
    fromFork: Boolean(pr.head?.repo && pr.base?.repo && pr.head.repo.full_name !== pr.base.repo.full_name),
    updatedAt: pr.updated_at,
    checks: { state: checks.state, text: checks.text, failing: checks.failing.slice(0, 5) },
    conflicts,
    mergeKnown: pr.mergeable !== null,
    behind: pr.mergeable_state === 'behind',
    green: ready,
  };
}

const isWipCheck = (name) => /^wip$/i.test(String(name || '').trim());

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function loadPr(octokit, owner, repo, number) {
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  const ref = pr.head?.sha;
  const [runs, status] = await Promise.allSettled([
    octokit.rest.checks.listForRef({ owner, repo, ref, per_page: 100 }),
    octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref }),
  ]);
  const checks = summarizeChecks(
    runs.status === 'fulfilled' ? runs.value.data.check_runs || [] : [],
    status.status === 'fulfilled' ? status.value.data.statuses || [] : [],
    { ignore: pr.draft ? isWipCheck : () => false },
  );
  return describePr(pr, checks);
}

/** Everything the window draws: open PRs with plain status, plus recent merges. */
export async function buildDesk(octokit, { owner, repo }) {
  const [open, closed] = await Promise.all([
    octokit.rest.pulls.list({ owner, repo, state: 'open', sort: 'updated', direction: 'desc', per_page: MAX_PRS }),
    octokit.rest.pulls.list({ owner, repo, state: 'closed', sort: 'updated', direction: 'desc', per_page: 30 }),
  ]);
  const prs = await mapLimit(open.data.slice(0, MAX_PRS), DETAIL_CONCURRENCY, (p) => loadPr(octokit, owner, repo, p.number));
  const recent = closed.data
    .filter((p) => p.merged_at)
    .sort((a, b) => Date.parse(b.merged_at) - Date.parse(a.merged_at))
    .slice(0, RECENT_MERGES)
    .map((p) => ({ number: p.number, title: p.title, url: p.html_url, author: p.user?.login || 'someone', mergedAt: p.merged_at, mergedBy: null }));
  return { repo: `${owner}/${repo}`, prs, recent, fetchedAt: new Date().toISOString() };
}

export async function loadOnePr(octokit, { owner, repo, number }) {
  return loadPr(octokit, owner, repo, number);
}

async function pickMergeMethod(octokit, owner, repo) {
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    if (data.allow_merge_commit !== false) return 'merge';
    if (data.allow_squash_merge) return 'squash';
    if (data.allow_rebase_merge) return 'rebase';
  } catch { /* fall back to a merge commit */ }
  return 'merge';
}

export async function markReady(octokit, nodeId) {
  try {
    await octokit.graphql(
      'mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }',
      { id: nodeId },
    );
  } catch (err) {
    throw deskError(`Couldn't mark it ready for review: ${err?.message || 'GitHub refused'}`, err?.status || 502);
  }
}

/** Turn GitHub's merge refusals into a sentence a person can act on. */
export function plainMergeError(err) {
  const status = err?.status;
  const msg = String(err?.response?.data?.message || err?.message || '');
  if (status === 401) return deskError('GitHub rejected the token. Paste a fresh one in this window.', 401);
  if (status === 403 || status === 404) return deskError("Your GitHub token can't merge here. It needs write access to this repo (classic token: the repo box; fine-grained: Contents and Pull requests set to Read and write).", 403);
  if (status === 409) return deskError('Someone pushed to this PR a moment ago. Refresh and tap Merge again.', 409);
  if (status === 405 && /conflict/i.test(msg)) return deskError('This PR has conflicts. Tap Fix conflicts first.', 409);
  if (status === 405) return deskError(`GitHub won't merge it yet: ${msg || 'a required check or review is missing'}.`, 409);
  return deskError(msg || 'GitHub could not merge this PR.', status && status >= 400 ? status : 502);
}

const WAIT_FOR_CHECKS = /required status|expected|pending|in progress|is not mergeable/i;

/**
 * One tap: mark ready if draft, merge with the repo's own method, and give a
 * just-flipped draft a few seconds for GitHub to settle before giving up.
 */
export async function mergePr(octokit, { owner, repo, number }, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), attempts = 6 } = {}) {
  let pr;
  try {
    ({ data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number }));
  } catch (err) {
    throw plainMergeError(err);
  }
  if (pr.merged) return { merged: true, already: true, sha: pr.merge_commit_sha, number };
  if (pr.state !== 'open') throw deskError('This PR was closed without merging.', 409);
  if (pr.mergeable === false) throw deskError('This PR has conflicts. Tap Fix conflicts first.', 409);
  const wasDraft = Boolean(pr.draft);
  if (wasDraft) await markReady(octokit, pr.node_id);
  const method = await pickMergeMethod(octokit, owner, repo);
  for (let i = 0; i < attempts; i++) {
    try {
      const { data } = await octokit.rest.pulls.merge({ owner, repo, pull_number: number, merge_method: method, sha: pr.head.sha });
      return { merged: true, sha: data.sha, number, method, markedReady: wasDraft };
    } catch (err) {
      const msg = String(err?.response?.data?.message || err?.message || '');
      const settling = err?.status === 405 && WAIT_FOR_CHECKS.test(msg) && !/conflict/i.test(msg);
      if (settling && i < attempts - 1) {
        await sleep(2500);
        continue;
      }
      throw plainMergeError(err);
    }
  }
  throw deskError('GitHub kept saying not yet. Try again in a minute.', 409);
}

/** GitHub's own "Update branch": merges the base in when that needs no hand edits. */
export async function updateBranch(octokit, { owner, repo, number, headSha }) {
  try {
    await octokit.rest.pulls.updateBranch({ owner, repo, pull_number: number, expected_head_sha: headSha });
    return { updated: true };
  } catch (err) {
    const msg = String(err?.response?.data?.message || err?.message || '');
    if (err?.status === 422 && /conflict/i.test(msg)) return { updated: false, conflicts: true };
    if (err?.status === 422 && /no new commits/i.test(msg)) return { updated: true, nothingToDo: true };
    throw plainMergeError(err);
  }
}
