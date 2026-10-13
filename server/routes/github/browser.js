import { getSecret } from '../../secrets.js';
import { getGithubDefaultBranch } from './shared.js';

export async function browseDir(req, res) {
  const { repo, path: dirPath } = req.query;
  if (!repo || repo === 'null' || repo === 'undefined') {
    return res.status(400).json({ error: 'Invalid or missing repo parameter' });
  }

  const token = getSecret('GITHUB_TOKEN');
  if (!token) return res.status(401).json({ error: 'GITHUB_TOKEN not found in .env' });

  let branch = req.query.branch;
  if (!branch) {
    try {
      branch = await getGithubDefaultBranch(repo, token);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const p = dirPath || '';
  const url = `https://api.github.com/repos/${repo}/contents/${encodeURI(p)}?ref=${branch}`;

  try {
    const r = await fetch(url, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' }
    });
    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: 'Not a directory' });
    }

    const children = data.map(item => ({
      name: item.name,
      path: item.path,
      isDir: item.type === 'dir'
    })).sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      path: p || '/',
      children
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTree(req, res) {
  const { repo } = req.query;
  if (!repo || repo === 'null' || repo === 'undefined') {
    return res.status(400).json({ error: 'Invalid or missing repo parameter' });
  }
  
  const token = getSecret('GITHUB_TOKEN');
  if (!token) return res.status(401).json({ error: 'GITHUB_TOKEN not found in .env' });

  let branch = req.query.branch;
  if (!branch) {
    try {
      branch = await getGithubDefaultBranch(repo, token);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  const fetchTree = async (b) => {
    const r = await fetch(`https://api.github.com/repos/${repo}/git/trees/${b}?recursive=1`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Homebase-App' }
    });
    if (!r.ok) return null;
    return await r.json();
  };

  let data = await fetchTree(branch);

  if (!data || !data.tree) {
    return res.status(404).json({ error: `Repository tree not found on branch '${branch}'` });
  }

  const root = { name: repo, path: '/', isDir: true, children: [] };
  const dirs = { '': root };
  
  for (const item of data.tree) {
    const parts = item.path.split('/');
    const name = parts.pop();
    const parentPath = parts.join('/');
    
    if (!dirs[parentPath]) {
      dirs[parentPath] = { name: parts[parts.length-1], path: parentPath, isDir: true, children: [] };
    }
    
    const node = {
      name,
      path: item.path,
      isDir: item.type === 'tree',
    };
    if (node.isDir) {
      node.children = [];
      dirs[item.path] = node;
    }
    dirs[parentPath].children.push(node);
  }
  
  res.json(root);
}
