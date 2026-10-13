// Import agent, account side:
//   POST /api/agent-import/account { platform: 'elevenlabs' }
//     → { platform, agents: [draft...] } read from the person's own account
// Files are read in the browser with the same translator
// (src/lib/agentImport); this route only exists for platforms whose agents
// can be listed with an API key. The key stays in the vault.

import express from 'express';
import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { getSecret } from '../secrets.js';
import { requiresPersonalApiKey } from '../security/byokPolicy.js';
import { parseAgentFile, AgentImportError } from '../../src/lib/agentImport/index.js';
import { AccountImportError, listElevenLabsAgents } from '../agent-import/elevenlabs.js';

export const ACCOUNT_PLATFORMS = Object.freeze(['elevenlabs']);

export function createAgentImportRouter(deps = {}) {
  const router = express.Router();
  const vault = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  const list = deps.listElevenLabsAgents || listElevenLabsAgents;

  router.post('/account', async (req, res) => {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Sign in first.' });
    const platform = String(req.body?.platform || '').toLowerCase();
    if (!ACCOUNT_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Pulling from an account works for ElevenLabs today. For other platforms, paste or drop the agent file.' });
    }
    try {
      let apiKey = (await vault(userId, 'elevenlabs').catch(() => null))?.apiKey || null;
      if (!apiKey && !requiresPersonalApiKey(req.session?.userRole)) apiKey = getSecret('ELEVENLABS_API_KEY') || null;
      const definitions = await list({ apiKey });
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

  return router;
}

export const agentImportRouter = createAgentImportRouter();
