import { dbReady } from '../../dbState.js';
import { getAgent, getSubAgentById, buildSystemPrompt } from '../../memory.js';
import { subAgentScopeError } from '../../memory/subagentTenancy.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import { filterToolsForAgent } from '../../tools.js';
import { buildSubAgentSystemPrompt } from './prompts.js';
import { withCensaiOrchestrator } from '../../agents/censaiOrchestrator.js';
import pool from '../../db.js';
import { capabilityProviderFor, getModelCapabilities } from '../../../src/lib/chat/modelCapabilities.js';
import { buildContentParts, messageAttachments } from '../../aiGateway/multimodal.js';
import {
  analyzeChangeImpact,
  formatChangeImpactForPrompt,
} from '../../semantic/changeImpact.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import { applySavedChatKey } from './savedChatKey.js';
import {
  enforceCoreChatBoundary,
  requireAgentContextRuntime,
} from '../../agents/familyRuntimeAccess.js';

// On a board with several projects each chat window is tied to one. Tell the
// agent which, so its project tools name that project, not the board default.
export function formatWindowProjectForPrompt(project) {
  const clean = (v, max) => String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);
  const projectPath = clean(project?.path, 400);
  if (!projectPath) return '';
  const name = clean(project?.name, 120) || projectPath.split(/[\\/]/).filter(Boolean).pop() || projectPath;
  return `This chat window works in the project "${name}" (folder: ${projectPath}). When a tool asks for a project, use "${name}" unless the user names another one.`;
}

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

  const useSavedKey = async () => {
    ({ provider, model: reqModel, baseUrl: reqBaseUrl, apiKey: reqApiKey } = await applySavedChatKey({
      provider, model: reqModel, baseUrl: reqBaseUrl, apiKey: reqApiKey, userId, userRole: effectiveRole,
    }));
  };

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

      await useSavedKey();

      if (agent) {
        const memoryPrompt = await buildSystemPrompt(agentId, lastUserMsg, {
          workspaceId: authorizedWorkspaceId,
          userId, historyInRequest: (messages?.length || 0) > 1,
          onProjectContext: (contexts) => {
            projectContext = contexts.map((context) => ({ ...context, prewarmed: true }));
          },
        });
        if (memoryPrompt) systemPrompt = withCensaiOrchestrator(agentId, memoryPrompt);
      } else {
        systemPrompt = await buildSubAgentSystemPrompt(sub, { workspaceId: authorizedWorkspaceId, userId });
      }
    } catch (err) {
      if (err?.code === 'FREE_TIER_CONFIG_INVALID') {
        throw Object.assign(new Error('AI access is temporarily unavailable'), {
          code: 'FREE_TIER_CONFIG_UNAVAILABLE', statusCode: 503,
        });
      }
      if (err?.code === 'MODEL_KEY_MISSING' || err?.code === 'MODEL_KEY_REJECTED') throw err;
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

  if (!agentId) await useSavedKey();

  const impactPrompt = formatChangeImpactForPrompt(changeImpact);
  if (impactPrompt) systemPrompt += `\n\n${impactPrompt}`;
  const windowProjectPrompt = formatWindowProjectForPrompt(currentProject);
  if (windowProjectPrompt) systemPrompt += `\n\n${windowProjectPrompt}`;

  const capabilities = getModelCapabilities(capabilityProviderFor(provider, reqBaseUrl), reqModel);
  const attachmentBudget = { used: 0 };
  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => {
      let content = m.text || '';
      const isFromOtherAgent = m.from !== 'me' && m.from !== 'system' && m.from !== agentId;
      const textPrefix = isFromOtherAgent ? `[${m.from}]: ` : '';
      const attachments = m.from === 'system' ? [] : messageAttachments(m);

      if (attachments.length > 0) {
        // Checked against the model's capability map: an unsupported
        // attachment is a 400 with a clear reason, never a silent drop.
        content = buildContentParts(
          { text: `${textPrefix}${m.text || ''}`, attachments },
          capabilities,
          { budget: attachmentBudget },
        );
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
