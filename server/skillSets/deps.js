// The real research dependencies for one person: Tavily (their key, then the
// server's, else no web search) and their chat model through the gateway, so
// their own model key (BYOK) or the governed free tier pays.

import { callModel, createModelAccessContext, workspaceUsageSink } from '../aiGateway/index.js';
import { createTavilyClient, resolveTavilyKey } from '../leadhound/tavily.js';

export function createSkillSetCompleter(scope, { modelProvider = null, modelName = null, source = 'skill-sets' } = {}) {
  const accessContext = createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source });
  return async (messages, { maxTokens = 2000, temperature = 0.4 } = {}) => {
    const data = await callModel({
      accessContext,
      modelProvider: modelProvider || null,
      modelName: modelName || null,
      body: { messages, max_tokens: maxTokens, temperature, ...(modelName ? { model: modelName } : {}) },
      timeoutMs: 120000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}

export async function skillSetResearchDeps(scope, model = {}) {
  const { apiKey } = await resolveTavilyKey(scope.userId);
  const tavily = apiKey ? createTavilyClient(apiKey, { purpose: 'research a skill set' }) : null;
  return {
    search: tavily ? (query) => tavily.search(query, { maxResults: 5 }) : null,
    complete: createSkillSetCompleter(scope, { ...model, source: model.source || 'skill-sets' }),
  };
}
