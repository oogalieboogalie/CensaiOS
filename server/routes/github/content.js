import { getSecret } from '../../secrets.js';
import { getGithubDefaultBranch, githubFileCache, GITHUB_FILE_CACHE_TTL } from './shared.js';

export async function readFile(req, res) {
  const { repo, path: filePath } = req.query;
  if (!repo || repo === 'null' || repo === 'undefined' || !filePath || filePath === 'null' || filePath === 'undefined') {
    return res.status(400).json({ error: 'Invalid or missing repo or path parameter' });
  }
  const token = getSecret('GITHUB_TOKEN');

  let branch = req.query.branch;
  if (!branch) {
    try {
      branch = await getGithubDefaultBranch(repo, token);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const cacheKey = `${repo}:${branch}:${filePath}`;
  const cached = githubFileCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GITHUB_FILE_CACHE_TTL) {
    return res.json({ content: cached.content, path: filePath, repo, branch, cached: true });
  }
  
  const tryFetch = async (b) => {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${b}/${filePath}`, {
      headers: token ? { 'Authorization': `token ${token}` } : {}
    });
    if (r.ok) return await r.text();
    return null;
  };

  try {
    let content = await tryFetch(branch);

    if (content === null) {
      return res.status(404).json({ error: `File not found on branch '${branch}'` });
    }

    githubFileCache.set(cacheKey, { content, ts: Date.now() });
    
    res.json({ content, path: filePath, repo, branch, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function writeFile(req, res) {
  const { repo, path: filePath, content, message, branch } = req.body;
  if (!repo || !filePath || !content) {
    return res.status(400).json({ error: 'Missing repo, path, or content in body' });
  }

  const token = getSecret('GITHUB_TOKEN');
  if (!token) return res.status(401).json({ error: 'GITHUB_TOKEN not found in .env' });

  try {
    let sha = null;
    try {
      const existingUrl = `https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}`;
      const existingRes = await fetch(existingUrl, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-Agent' }
      });
      if (existingRes.ok) {
        const existingData = await existingRes.json();
        sha = existingData.sha;
      }
    } catch {}

    const body = {
      message: message || `Add ${filePath.split('/').pop()} via Homebase`,
      content: content,
    };
    if (sha) body.sha = sha;
    if (branch) body.branch = branch;

    const response = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURI(filePath)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Homebase-Agent'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const result = await response.json();
    res.json({ ok: true, path: filePath, commit: result.commit?.sha, url: result.content?.html_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
