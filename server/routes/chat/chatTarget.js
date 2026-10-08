// Resolve which provider + model an agent's chat runs on, and with which key,
// without building a prompt. Backs the chat window's capability lookup and the
// voice endpoints. Mirrors the model/key resolution in chatContext.js: agent or
// workspace sub-agent → provider adapter → personal vault key wins.

import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { getAgent, getSubAgentById } from '../../memory.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import { getUserApiKeyConfig, inferUserApiKeyProvider } from '../../security/userApiKeys.js';
import { resolveWorkspaceContext } from '../../workspaces/context.js';
import {
  capabilityProviderFor,
  getModelCapabilities,
} from '../../../src/lib/chat/modelCapabilities.js';

export async function resolveChatTarget({ agentId, userId = null, workspaceId = null } = {}) {
  let config = resolveChatModelConfig();
  let provider = config.provider;
  let model = config.model;

  if (agentId && dbReady()) {
    let record = await getAgent(agentId, userId);
    if (!record && workspaceId) {
      const workspace = userId
        ? await resolveWorkspaceContext(pool, { userId, workspaceId })
        : { id: workspaceId };
      record = await getSubAgentById(agentId, { workspaceId: workspace.id, userId });
    }
    if (record) {
      config = resolveChatModelConfig({ modelProvider: record.model_provider, modelName: record.model_name });
      provider = record.model_provider || config.provider;
      model = config.model;
    }
  }

  let apiKey = config.apiKey;
  let personalKey = false;
  if (userId && provider) {
    try {
      const keyProvider = inferUserApiKeyProvider(provider, config.baseUrl);
      const personal = keyProvider ? await getUserApiKeyConfig(userId, keyProvider) : null;
      if (personal) {
        apiKey = personal.apiKey;
        personalKey = true;
        if (personal.modelName) model = personal.modelName;
      }
    } catch {
      /* best-effort, same as chat */
    }
  }

  const capabilityProvider = capabilityProviderFor(provider, config.baseUrl);
  return {
    provider: capabilityProvider,
    model,
    baseUrl: config.baseUrl,
    apiKey,
    personalKey,
    capabilities: getModelCapabilities(capabilityProvider, model),
  };
}
