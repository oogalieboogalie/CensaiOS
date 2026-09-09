import { dbReady } from '../../dbState.js';
import { getAgent, getSubAgentById, buildSystemPrompt } from '../../memory.js';
import { subAgentScopeError } from '../../memory/subagentTenancy.js';
import { ModelAccessError, resolveChatModelConfig } from '../../aiGateway/index.js';
import { filterToolsForAgent } from '../../tools.js';
import { buildSubAgentSystemPrompt } from './prompts.js';
import pool from '../../db.js';
import {
  getUserApiKeyConfig,
  inferUserApiKeyProvider,
} from '../../security/userApiKeys.js';
import { requiresPersonalApiKey } from '../../security/byokPolicy.js';
import {
  analyzeChangeImpact,
  formatChangeImpactForPrompt,
} from '../../semantic/changeImpact.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { resolveFreeTierRuntime } from '../../aiGateway/freeTierRuntime.js';
import {
  enforceCoreChatBoundary,
  requireAgentContextRuntime,
} from '../../agents/familyRuntimeAccess.js';

export async function prepareChatContext(
  agentId,
  currentProject,
  messages,
  userId = null,
  userRole = null,
  workspaceId = null
) {
  let modelConfig = resolveChatModelConfig();
  let reqModel = modelConfig.model;
  let reqBaseUrl = modelConfig.baseUrl;
  let reqApiKey = modelConfig.apiKey;
  let provider = modelConfig.provider;
  let systemPrompt = 'You are a helpful assistant.';
  const lastUserMsg = messages?.filter(m => m.from === 'me').pop()?.text;
  const changeImpact = analyzeChangeImpact(lastUserMsg, { project: currentProject });
  let authorizedWorkspaceId = null;
  let projectContext = [];
  let sub = null;

  if (agentId) requireAgentContextRuntime(dbReady());

  let effectiveRole = userRole;
  if (userId && !effectiveRole && dbReady()) {
    const userRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    effectiveRole = userRes.rows[0]?.role || 'user';
  }

  if (agentId) {
    try {
      if (workspaceId) {
        if (userId) {
          const workspace = await resolveWorkspaceContext(pool, { userId, workspaceId });
          authorizedWorkspaceId = workspace.id;
        } else {
          authorizedWorkspaceId = workspaceId;
        }
      }

      const agent = await getAgent(agentId, userId);
      enforceCoreChatBoundary({ agentId, agent, userRole: effectiveRole });

      if (agent) {
        modelConfig = resolveChatModelConfig({
          modelProvider: agent.model_provider,
          modelName: agent.model_name,
        });
        provider = agent.model_provider || modelConfig.provider;
        reqModel = modelConfig.model;
        reqBaseUrl = modelConfig.baseUrl;
        reqApiKey = modelConfig.apiKey;
      } else {
        if (!authorizedWorkspaceId) throw subAgentScopeError('Open a workspace to chat with a custom sub-agent.');
        sub = await getSubAgentById(agentId, { workspaceId: authorizedWorkspaceId, userId });
        if (!sub) {
          const error = new Error('Sub-agent not found in this workspace.');
          error.statusCode = 404;
          throw error;
        }
        modelConfig = resolveChatModelConfig({
          modelProvider: sub.model_provider,
          modelName: sub.model_name
        });
        provider = sub.model_provider || modelConfig.provider;
        reqModel = modelConfig.model;
        reqBaseUrl = modelConfig.baseUrl;
        reqApiKey = modelConfig.apiKey;
      }

      // Personal vault keys win in every mode when present (local included);
      // server keys are the fallback. Lookup failures never block chat —
      // the cloud enforcement below still fails closed where it must.
      // (No console logging here: test harness fails on console output.)
      if (userId && provider) {
        try {
          const personalProvider = inferUserApiKeyProvider(provider, reqBaseUrl);
          const personal = personalProvider
            ? await getUserApiKeyConfig(userId, personalProvider)
            : null;
          if (personal) {
            reqApiKey = personal.apiKey;
            if (personal.modelName) reqModel = personal.modelName;
          }
        } catch {
          /* best-effort only */
        }
      }

      // Cloud SaaS users must supply credentials for paid providers.
      // Local and private-server installs deliberately use the server-managed route.
      const centralFreeAccessEnabled = resolveFreeTierRuntime().enabled;
      if (userId && requiresPersonalApiKey(effectiveRole) && !centralFreeAccessEnabled) {
        const isLocalProvider = reqBaseUrl.includes('localhost') || reqBaseUrl.includes('127.0.0.1') || reqBaseUrl.includes('host.docker.internal');
        const isFreeModel = provider === 'openrouter' && reqModel.endsWith(':free');
        const credentialProvider = inferUserApiKeyProvider(provider, reqBaseUrl);

        let userKeyConfig = null;
        try {
          userKeyConfig = await getUserApiKeyConfig(userId, credentialProvider);
        } catch (keyErr) {
          if (!isLocalProvider && !isFreeModel) {
            throw new ModelAccessError(
              'MODEL_ACCESS_UNAVAILABLE',
              'Unable to verify a personal API key',
              503,
              5,
            );
          }
          console.warn('[Tenancy] Personal key lookup failed:', keyErr.message);
        }

        if (userKeyConfig) {
          reqApiKey = userKeyConfig.apiKey;
          if (userKeyConfig.modelName) reqModel = userKeyConfig.modelName;
        } else if (!isLocalProvider && !isFreeModel) {
          throw new ModelAccessError(
            'MODEL_ACCESS_PERSONAL_KEY_REQUIRED',
            `"${reqModel}" requires a personal API key. Add one in Settings or use free AI access.`,
            403,
          );
        }
      }

      if (agent) {
        const memoryPrompt = await buildSystemPrompt(agentId, lastUserMsg, {
          workspaceId: authorizedWorkspaceId,
          userId,
          onProjectContext: (contexts) => {
            projectContext = contexts.map((context) => ({ ...context, prewarmed: true }));
          },
        });
        if (memoryPrompt) systemPrompt = memoryPrompt;
      } else {
        systemPrompt = await buildSubAgentSystemPrompt(sub, { workspaceId: authorizedWorkspaceId, userId });
      }
    } catch (err) {
      if (err?.code === 'FREE_TIER_CONFIG_INVALID') {
        throw Object.assign(new Error('AI access is temporarily unavailable'), {
          code: 'FREE_TIER_CONFIG_UNAVAILABLE', statusCode: 503,
        });
      }
      if (String(err?.code || '').startsWith('FAMILY_AGENT_')) throw err;
      if (err?.name === 'ModelAccessError') throw err;
      if (err.code === 'SUB_AGENT_SCOPE_REQUIRED' || err.statusCode === 404) throw err;
      if (workspaceId && (err.statusCode === 403 || err.statusCode === 404)) throw err;
      throw Object.assign(new Error('Agent context is temporarily unavailable.'), {
        code: 'AGENT_CONTEXT_UNAVAILABLE',
        statusCode: 503,
      });
    }
  }

  const impactPrompt = formatChangeImpactForPrompt(changeImpact);
  if (impactPrompt) systemPrompt += `\n\n${impactPrompt}`;

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      let content = m.text || '';
      const isFromOtherAgent = m.from !== 'me' && m.from !== 'system' && m.from !== agentId;
      const textPrefix = isFromOtherAgent ? `[${m.from}]: ` : '';

      if (m.image) {
        content = [
          { type: 'text', text: `${textPrefix}${m.text || 'Describe this image.'}` },
          { type: 'image_url', image_url: { url: m.image } }
        ];
      } else if (isFromOtherAgent) {
        content = `${textPrefix}${content}`;
      }

      // 'agent' is the legacy 1:1 sender tag (pre-agent.id); it can only mean this agent.
      const isLegacySelf = m.from === 'agent';
      const role = m.from === 'system'
        ? 'system'
        : (m.from === 'me' || (isFromOtherAgent && !isLegacySelf) ? 'user' : 'assistant');
      return {
        role,
        content,
      };
    }),
  ];

  const toolsForCaller = agentId
    ? await filterToolsForAgent(agentId, { workspaceId: authorizedWorkspaceId, userId })
    : null;

  return {
    reqModel,
    reqBaseUrl,
    reqApiKey,
    reqProvider: provider,
    chatMessages,
    toolsForCaller,
    changeImpact,
    projectContext,
    workspaceId: authorizedWorkspaceId,
  };
}
