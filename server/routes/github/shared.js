import { createHash } from 'node:crypto';
import { githubApiUrl } from '../../github/apiUrl.js';

export const githubBranchCache = new Map();
export const githubFileCache = new Map();
export const GITHUB_FILE_CACHE_TTL = 60_000;

// A kept copy belongs to the key that read it: a private project's file or
// branch name read with one person's key is never handed to another key.
export function githubKeyTag(token) {
  return token ? createHash('sha256').update(String(token)).digest('hex').slice(0, 16) : 'none';
}

export async function fetchGithub(endpoint, res, token) {
  if (!token) {
    res.status(401).json({ error: 'Connect GitHub first: paste a token in the GitHub window.' });
    return null;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${githubApiUrl()}${endpoint}`;
  try {
    const r = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Homebase-App'
      }
    });
    if (!r.ok) {
      const err = await r.text();
      res.status(r.status).json({ error: err });
      return null;
    }
    return await r.json();
  } catch (err) {
    res.status(500).json({ error: err.message });
    return null;
  }
}

export async function getGithubDefaultBranch(repo, token) {
  const cacheKey = `${githubKeyTag(token)}:${repo}`;
  const cached = githubBranchCache.get(cacheKey);
  if (cached) return cached;

  const repoRes = await fetch(`${githubApiUrl()}/repos/${repo}`, {
    headers: token ? { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' } : { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' }
  });
  if (!repoRes.ok) {
    const errText = await repoRes.text();
    throw new Error(`Failed to fetch repo info: ${errText}`);
  }
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || 'main';
  githubBranchCache.set(cacheKey, branch);
  return branch;
}
