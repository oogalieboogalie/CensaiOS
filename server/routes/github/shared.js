import { getSecret } from '../../secrets.js';

export const githubBranchCache = new Map();
export const githubFileCache = new Map();
export const GITHUB_FILE_CACHE_TTL = 60_000;

export async function fetchGithub(endpoint, res) {
  const token = getSecret('GITHUB_TOKEN');
  if (!token) {
    res.status(401).json({ error: 'GITHUB_TOKEN not found in .env' });
    return null;
  }

  const url = endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`;
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
  const cached = githubBranchCache.get(repo);
  if (cached) return cached;

  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: token ? { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' } : { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' }
  });
  if (!repoRes.ok) {
    const errText = await repoRes.text();
    throw new Error(`Failed to fetch repo info: ${errText}`);
  }
  const repoData = await repoRes.json();
  const branch = repoData.default_branch || 'main';
  githubBranchCache.set(repo, branch);
  return branch;
}
