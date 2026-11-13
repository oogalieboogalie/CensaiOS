import { getGithubDefaultBranch } from './shared.js';
import { githubApiUrl } from '../../github/apiUrl.js';

export async function searchTree(req, res) {
  const { repo, q } = req.query;
  if (!repo || repo === 'null' || repo === 'undefined') {
    return res.status(400).json({ error: 'Invalid or missing repo parameter' });
  }
  if (!q) {
    return res.json([]);
  }

  const token = req.githubToken;
  if (!token) return res.status(401).json({ error: 'Connect GitHub first: paste a token in the GitHub window.' });

  let branch = req.query.branch;
  if (!branch) {
    try {
      branch = await getGithubDefaultBranch(repo, token);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const r = await fetch(`${githubApiUrl()}/repos/${repo}/git/trees/${branch}?recursive=1`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' }
    });
    if (!r.ok) {
      return res.json([]);
    }

    const data = await r.json();
    if (!data || !data.tree) {
      return res.json([]);
    }

    const qLower = q.toLowerCase();
    const results = [];
    const max = 100;

    for (const item of data.tree) {
      if (results.length >= max) break;
      if (item.path.toLowerCase().includes(qLower)) {
        const parts = item.path.split('/');
        results.push({
          name: parts[parts.length - 1],
          path: item.path,
          isDir: item.type === 'tree'
        });
      }
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
