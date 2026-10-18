/**
 * What is still being worked on, for the tray's Update button: changes the
 * crew has open on GitHub for this copy's repository (they land on master
 * soon, so waiting for them can save a second update) and agents mid-task on
 * this server (an update waits for those to finish, never cuts them off).
 */

import fs from 'fs';
import path from 'path';
import { getGitHubClient } from '../routes/github/client.js';
import { selfRepo } from '../selfFix/patches.js';
import { createLogger } from '../logger.js';
import { busyAgents } from './busy.js';

const log = createLogger('app-update');
const MAX_CHANGES = 10;
const GITHUB_REMOTE = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\s*$/m;

/** owner/repo of this copy's origin remote, or null. */
export function repoSlug(repoRoot = selfRepo()) {
  if (!repoRoot) return null;
  try {
    const config = fs.readFileSync(path.join(repoRoot, '.git', 'config'), 'utf8');
    const origin = config.split(/^\[/m).find((part) => part.startsWith('remote "origin"'));
    const match = origin?.match(/url\s*=\s*(.+)$/m)?.[1].match(GITHUB_REMOTE);
    return match ? { owner: match[1], repo: match[2] } : null;
  } catch {
    return null;
  }
}

async function openPulls({ owner, repo }) {
  const octokit = getGitHubClient();
  const { data } = await octokit.rest.pulls.list({ owner, repo, state: 'open', base: 'master', per_page: 50 });
  return data;
}

/**
 * { changes: [{ number, title }], agents: [{ name, what }], github } where
 * github is 'ok', 'no-repo' or 'unavailable' (no key, offline). Never throws.
 */
export async function workInFlight({ slug = repoSlug(), listPulls = openPulls, agents = busyAgents } = {}) {
  let changes = [];
  let github = 'no-repo';
  if (slug) {
    try {
      const pulls = await listPulls(slug);
      changes = pulls
        .filter((pr) => !pr.draft)
        .slice(0, MAX_CHANGES)
        .map((pr) => ({ number: pr.number, title: String(pr.title || '').slice(0, 120) }));
      github = 'ok';
    } catch (error) {
      github = 'unavailable';
      log.warn(`could not list open changes on ${slug.owner}/${slug.repo}: ${error?.message || error}`);
    }
  }
  const working = await agents().catch(() => []);
  return { changes, agents: working, github };
}
