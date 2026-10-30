import path from 'path';
import { getGithubDefaultBranch, githubFileCache, GITHUB_FILE_CACHE_TTL } from './shared.js';
import { secretRepoPath } from '../../security/secretFiles.js';
import { isRepoName } from '../../github.js';
import { isComputerOwner } from '../../security/systemAdmin.js';
import { FILE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { githubApiUrl } from '../../github/apiUrl.js';

// raw.githubusercontent.com reads %2e as "." and stops a path at # or ?, so
// every part is sent spelled out: what is checked is what GitHub gets.
const spelled = (text) => String(text).split('/').map(encodeURIComponent).join('/');

export async function readFile(req, res) {
  const { repo, path: asked } = req.query;
  if (!repo || repo === 'null' || repo === 'undefined' || !asked || asked === 'null' || asked === 'undefined') {
    return res.status(400).json({ error: 'Invalid or missing repo or path parameter' });
  }
  const filePath = path.posix.normalize(String(asked).replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!isRepoName(repo) || filePath.startsWith('..') || filePath === '.') {
    return res.status(400).json({ error: 'Invalid or missing repo or path parameter' });
  }
  // A file that holds keys by its name opens only for this computer's owner, as
  // in a project on this computer (server/security/ownerOnlyFiles.js), and
  // ownerOnly keeps its words on the owner's screen, off the shared board.
  const ownerOnly = secretRepoPath(filePath);
  if (ownerOnly && !(await isComputerOwner(req, 'GET /api/github/file').catch(() => false))) {
    return res.status(403).json({ error: FILE_PROBLEMS.ownerOnly, reason: 'ownerOnly' });
  }
  const mark = ownerOnly ? { ownerOnly: true } : {};
  const token = req.githubToken;

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
    return res.json({ content: cached.content, path: asked, repo, branch, cached: true, ...mark });
  }
  
  const tryFetch = async (b) => {
    const r = await fetch(`https://raw.githubusercontent.com/${repo}/${spelled(b)}/${spelled(filePath)}`, {
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
    
    res.json({ content, path: asked, repo, branch, cached: false, ...mark });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function writeFile(req, res) {
  const { repo, path: filePath, content, message, branch } = req.body;
  if (!repo || !filePath || !content) {
    return res.status(400).json({ error: 'Missing repo, path, or content in body' });
  }

  const token = req.githubToken;
  if (!token) return res.status(401).json({ error: 'Connect GitHub first: paste a token in the GitHub window.' });

  try {
    let sha = null;
    try {
      const existingUrl = `${githubApiUrl()}/repos/${repo}/contents/${encodeURI(filePath)}`;
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

    const response = await fetch(`${githubApiUrl()}/repos/${repo}/contents/${encodeURI(filePath)}`, {
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
