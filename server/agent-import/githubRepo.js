// Import agent, GitHub side: find every agent file in a repo the person picks
// (Claude helpers in .claude/agents, Google ADK agent.py / root_agent.yaml,
// and agent JSON such as Grok's) and read each with the same translator the
// browser uses for a dropped file (src/lib/agentImport). Nothing runs.

import { parseAgentFile, AgentImportError, MAX_IMPORT_BYTES } from '../../src/lib/agentImport/index.js';
import { AccountImportError } from './elevenlabs.js';
import { githubApiUrl } from '../github/apiUrl.js';

export const MAX_REPO_AGENT_FILES = 30;
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/** "owner/repo" or a github.com link → "owner/repo", or null. */
export function parseRepoName(input) {
  let text = String(input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const link = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/?#]+)/i);
  if (link) text = link[1];
  return REPO_RE.test(text) && !text.split('/')[1].startsWith('.') ? text : null;
}

/** Which repo paths look like agent files, and which platform to hint. */
export function agentFileHint(filePath) {
  const p = String(filePath);
  const name = p.split('/').pop().toLowerCase();
  if (/(^|\/)\.claude\/agents\/[^/]+\.md$/i.test(p)) return 'claude';
  if (name === 'agent.py' || name === 'root_agent.yaml' || name === 'root_agent.yml') return 'google-adk';
  if (name.endsWith('.json') && /agent/.test(name) && !/package|lock|tsconfig/.test(name)) return 'detect';
  return null;
}

function headers(token, accept = 'application/vnd.github+json') {
  return { Accept: accept, 'User-Agent': 'censaiOS', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function ask(fetchImpl, url, token, accept) {
  const res = await fetchImpl(url, { headers: headers(token, accept) });
  if (res.status === 404) throw new AccountImportError('That repo was not found, or your GitHub sign-in cannot see it.', 404);
  if (res.status === 401 || res.status === 403) throw new AccountImportError('GitHub refused your sign-in. Check the GitHub key in Settings → Vault.', 403);
  if (!res.ok) throw new AccountImportError(`GitHub answered ${res.status}.`, 502);
  return accept === 'application/vnd.github.raw' ? res.text() : res.json();
}

/**
 * @returns {Promise<{repo:string, branch:string, agents:object[], skipped:{file:string, why:string}[], capped:boolean}>}
 */
export async function listRepoAgents(repo, { token = null, fetchImpl = fetch, max = MAX_REPO_AGENT_FILES } = {}) {
  const info = await ask(fetchImpl, `${githubApiUrl()}/repos/${repo}`, token);
  const branch = info.default_branch || 'main';
  const tree = await ask(fetchImpl, `${githubApiUrl()}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
  const files = (tree.tree || [])
    .filter(item => item.type === 'blob' && agentFileHint(item.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const agents = [];
  const skipped = [];
  for (const item of files.slice(0, max)) {
    if (item.size > MAX_IMPORT_BYTES) { skipped.push({ file: item.path, why: 'too big to be an agent (over 512 KB)' }); continue; }
    const hint = agentFileHint(item.path);
    const encoded = item.path.split('/').map(encodeURIComponent).join('/');
    const text = await ask(fetchImpl, `${githubApiUrl()}/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`, token, 'application/vnd.github.raw');
    try {
      const parsed = parseAgentFile(text, { platform: hint === 'detect' ? null : hint, fileName: item.path.split('/').pop() });
      for (const agent of parsed.agents) agents.push({ ...agent, sourceFile: item.path });
    } catch (err) {
      if (!(err instanceof AgentImportError)) throw err;
      skipped.push({ file: item.path, why: err.message });
    }
  }
  return { repo, branch, agents, skipped, capped: files.length > max || Boolean(tree.truncated) };
}
