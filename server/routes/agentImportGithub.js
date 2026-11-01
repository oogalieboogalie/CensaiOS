// Import agent, GitHub repo:
//   POST /api/agent-import/github { repo: 'owner/name' | github link }
//     → { repo, branch, agents: [draft...], skipped, capped }
//   POST /api/agent-import/github/imported { repo, names } (app log only)
// Uses the person's own GitHub key from the vault (the owner may fall back
// to the server's GITHUB_TOKEN); public repos also work with no key.

import express from 'express';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { getSecret } from '../secrets.js';
import { mayUseServerKeys } from '../security/serverKeys.js';
import { AccountImportError } from '../agent-import/elevenlabs.js';
import { listRepoAgents, parseRepoName } from '../agent-import/githubRepo.js';

const log = createLogger('agent-import');

function platformCounts(agents) {
  const counts = {};
  for (const agent of agents) counts[agent.platform] = (counts[agent.platform] || 0) + 1;
  return Object.entries(counts).map(([platform, n]) => `${platform} ${n}`).join(', ') || 'none';
}

export function createAgentImportGithubRouter(deps = {}) {
  const router = express.Router();
  const vault = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  const list = deps.listRepoAgents || listRepoAgents;

  router.post('/', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Sign in first.' });
    const repo = parseRepoName(req.body?.repo);
    if (!repo) return res.status(400).json({ error: 'Type the repo as owner/name, for example jordan/shop-agents, or paste its GitHub link.' });
    try {
      let token = (await vault(userId, 'github').catch(() => null))?.apiKey || null;
      if (!token && await mayUseServerKeys({ userId, userRole: req.session?.userRole || null })) token = getSecret('GITHUB_TOKEN') || null;
      const found = await list(repo, { token });
      log.info(`agent-import: github pull: ${repo}@${found.branch}: found ${found.agents.length} (${platformCounts(found.agents)}), skipped ${found.skipped.length}`);
      return res.json(found);
    } catch (err) {
      const status = err instanceof AccountImportError ? err.status : 500;
      log.warn('agent-import: github pull could not read a repo', { code: safeErrorCode(err) });
      return res.status(status).json({ error: status === 500 ? `Could not read that repo: ${err.message}` : err.message });
    }
  });

  router.post('/imported', (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Sign in first.' });
    const repo = parseRepoName(req.body?.repo) || 'unknown repo';
    const names = (Array.isArray(req.body?.names) ? req.body.names : []).map(String).slice(0, 50);
    log.info(`agent-import: github pull: ${repo}: imported ${names.length} (${names.join(', ')})`);
    return res.json({ ok: true });
  });

  return router;
}

export const agentImportGithubRouter = createAgentImportGithubRouter();
