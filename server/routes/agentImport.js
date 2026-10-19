// Import agent, account side:
//   POST /api/agent-import/account { platform: 'elevenlabs' | 'openai' }
//     → { platform, agents: [draft...] } read from the person's own account
//   POST /api/agent-import/project (agentImportProject.js, owner only)
//   POST /api/agent-import/github (agentImportGithub.js)
// Files are read in the browser with the same translator
// (src/lib/agentImport); this route only exists for platforms whose agents
// can be listed with an API key. The key stays in the vault.

import express from 'express';
import { hostedAgentsRouter } from './hostedAgents.js';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { getSecret } from '../secrets.js';
import { mayUseServerKeys } from '../security/serverKeys.js';
import { parseAgentFile, AgentImportError } from '../../src/lib/agentImport/index.js';
import { AccountImportError, listElevenLabsAgents } from '../agent-import/elevenlabs.js';
import { listOpenAiAssistants } from '../agent-import/openai.js';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import { agentImportProjectRouter } from './agentImportProject.js';
import { agentImportGithubRouter } from './agentImportGithub.js';

// Platforms whose agents can be listed with the person's own key:
// vault provider, the server's fallback secret, and the lister to call.
const ACCOUNTS = Object.freeze({
  elevenlabs: { secret: 'ELEVENLABS_API_KEY', lister: 'listElevenLabsAgents' },
  openai: { secret: 'OPENAI_API_KEY', lister: 'listOpenAiAssistants' },
});
export const ACCOUNT_PLATFORMS = Object.freeze(Object.keys(ACCOUNTS));

export function createAgentImportRouter(deps = {}) {
  const router = express.Router();
  const vault = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  const listers = {
    listElevenLabsAgents: deps.listElevenLabsAgents || listElevenLabsAgents,
    listOpenAiAssistants: deps.listOpenAiAssistants || listOpenAiAssistants,
  };

  router.use('/project', requireLocalFilesystem, deps.projectRouter || agentImportProjectRouter);
  router.use('/github', deps.githubRouter || agentImportGithubRouter);

  router.post('/account', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Sign in first.' });
    const platform = String(req.body?.platform || '').toLowerCase();
    if (!ACCOUNT_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Pulling from an account works for ElevenLabs and OpenAI today. For other platforms, paste or drop the agent file.' });
    }
    const account = ACCOUNTS[platform];
    try {
      let apiKey = (await vault(userId, platform).catch(() => null))?.apiKey || null;
      if (!apiKey && await mayUseServerKeys({ userId, userRole: req.session?.userRole || null })) {
        apiKey = getSecret(account.secret) || null;
      }
      const definitions = await listers[account.lister]({ apiKey });
      const agents = [];
      const skipped = [];
      for (const def of definitions) {
        try {
          agents.push(...parseAgentFile(JSON.stringify(def), { platform }).agents);
        } catch (err) {
          if (!(err instanceof AgentImportError)) throw err;
          skipped.push(String(def?.name || def?.agent_id || 'agent'));
        }
      }
      return res.json({ platform, agents, skipped });
    } catch (err) {
      const status = err instanceof AccountImportError ? err.status : 500;
      return res.status(status).json({ error: err.message });
    }
  });

  // Hosted agents (owner only): server/routes/hostedAgents.js.
  router.use('/hosted', deps.hostedRouter || hostedAgentsRouter);

  return router;
}

export const agentImportRouter = createAgentImportRouter();
