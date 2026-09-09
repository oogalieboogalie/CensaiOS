// ═══════════════════════════════════════════════════════════════════
//  GITHUB API HELPERS
//  Thin wrappers around the contents + git refs + pulls endpoints so
//  the rest of the codebase doesn't deal with PATs, base64, or SHAs.
// ═══════════════════════════════════════════════════════════════════

async function fetchGithub(endpoint, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured in .env');
  const needsContentType = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Homebase-Agent',
      ...(needsContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getRepoInfo(repo) {
  return fetchGithub(`/repos/${repo}`);
}

export async function getDefaultBranch(repo) {
  const info = await getRepoInfo(repo);
  return info.default_branch;
}

export async function getTree(repo, ref) {
  const branch = ref || await getDefaultBranch(repo);
  const refData = await fetchGithub(`/repos/${repo}/git/refs/heads/${branch}`);
  const tree = await fetchGithub(`/repos/${repo}/git/trees/${refData.object.sha}?recursive=1`);
  return tree.tree || []; // array of { path, type, sha, size }
}

export async function getFile(repo, filePath, ref) {
  const url = `/repos/${repo}/contents/${encodeURI(filePath)}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const res = await fetchGithub(url);
  if (res.type === 'file' && typeof res.content === 'string') {
    return Buffer.from(res.content, 'base64').toString('utf8');
  }
  throw new Error(`Not a file: ${filePath}`);
}

export async function tryGetFile(repo, filePath, ref) {
  try {
    return await getFile(repo, filePath, ref);
  } catch {
    return null;
  }
}

export async function listDir(repo, dirPath, ref) {
  const url = `/repos/${repo}/contents/${encodeURI(dirPath || '')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const res = await fetchGithub(url);
  if (!Array.isArray(res)) return [];
  return res.map(e => ({ name: e.name, type: e.type === 'dir' ? 'dir' : 'file', path: e.path }));
}

export async function putFile(repo, filePath, content, message, branch) {
  let sha = null;
  try {
    const url = `/repos/${repo}/contents/${encodeURI(filePath)}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`;
    const existing = await fetchGithub(url);
    if (existing?.sha) sha = existing.sha;
  } catch {}

  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
  };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;

  return fetchGithub(`/repos/${repo}/contents/${encodeURI(filePath)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function branchExists(repo, branch) {
  try {
    await fetchGithub(`/repos/${repo}/git/refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

export async function createBranch(repo, branch, fromBranch) {
  const base = fromBranch || await getDefaultBranch(repo);
  const refData = await fetchGithub(`/repos/${repo}/git/refs/heads/${base}`);
  return fetchGithub(`/repos/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: refData.object.sha,
    }),
  });
}

export async function ensureBranch(repo, branch, fromBranch) {
  if (await branchExists(repo, branch)) return false;
  await createBranch(repo, branch, fromBranch);
  return true;
}

export async function openPR(repo, head, title, body, base) {
  const baseBranch = base || await getDefaultBranch(repo);
  return fetchGithub(`/repos/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ head, base: baseBranch, title, body: body || '' }),
  });
}

export async function createIssue(repo, title, body, labels) {
  const payload = { title, body: body || '' };
  if (labels && labels.length) payload.labels = labels;
  return fetchGithub(`/repos/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Convert a flat GitHub tree (array of { path, type }) into a printable
// tree string similar to the local one, depth-limited and pruned of
// node_modules etc.
const ALWAYS_IGNORE_DIRS = new Set([
  'node_modules', '.next', '.nuxt', 'dist', 'build', 'out',
  '.cache', '.vite', '.parcel-cache', '.turbo', '__pycache__',
  '.venv', 'venv', 'env', 'coverage',
]);

export function formatGithubTree(entries, { maxDepth = 3, maxEntries = 80 } = {}) {
  // Filter ignored top-level paths and depth-limit
  const kept = entries.filter(e => {
    const parts = e.path.split('/');
    if (parts.some(p => ALWAYS_IGNORE_DIRS.has(p))) return false;
    if (parts.length > maxDepth) return false;
    return true;
  });

  // Build a nested tree
  const root = {};
  for (const e of kept) {
    const parts = e.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const last = i === parts.length - 1;
      const name = parts[i];
      if (!node[name]) node[name] = { __children: {}, __isDir: !last || e.type === 'tree' };
      if (!last) node = node[name].__children;
    }
  }

  let count = 0;
  let truncated = false;

  function render(obj, prefix) {
    const names = Object.keys(obj).sort((a, b) => {
      const aDir = obj[a].__isDir ? 0 : 1;
      const bDir = obj[b].__isDir ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.localeCompare(b);
    });
    let out = '';
    for (let i = 0; i < names.length; i++) {
      if (count >= maxEntries) { truncated = true; break; }
      const name = names[i];
      const node = obj[name];
      const last = i === names.length - 1;
      const branch = last ? '└── ' : '├── ';
      out += `${prefix}${branch}${name}${node.__isDir ? '/' : ''}\n`;
      count++;
      if (node.__isDir) {
        out += render(node.__children, prefix + (last ? '    ' : '│   '));
      }
    }
    return out;
  }

  let str = render(root, '');
  if (truncated) str += '… (truncated)\n';
  return str;
}
