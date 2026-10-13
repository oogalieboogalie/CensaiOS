import { getAgent, getSubAgentById } from '../memory.js';
import { resolveChatModelConfig } from '../aiGateway/index.js';

// Which model builds a module: the asking agent's own model (chat path), or
// the default chat agent's for a request typed in the Add palette, so a
// module is built by the same provider and key the person already chats with.
export const DEFAULT_MODULE_AGENT = 'censai';

export async function moduleModelConfig({ agentId = DEFAULT_MODULE_AGENT, userId, workspaceId, modelProvider = null, modelName = null } = {}) {
  if (modelProvider || modelName) return resolveChatModelConfig({ modelProvider, modelName });
  let record = await getAgent(agentId, userId).catch(() => null);
  if (!record && workspaceId) record = await getSubAgentById(agentId, { workspaceId, userId }).catch(() => null);
  return record
    ? resolveChatModelConfig({ modelProvider: record.model_provider, modelName: record.model_name })
    : resolveChatModelConfig();
}
