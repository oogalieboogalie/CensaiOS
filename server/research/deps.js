// RESEARCH — the real dependencies for one signed-in person: their Tavily
// key (BYOK, then the server's), their embedding key, and their chat model
// through the gateway, which bills their own key or the governed free tier.

import { callModel, createModelAccessContext, workspaceUsageSink } from '../aiGateway/index.js';
import { createTavilyClient, resolveTavilyKey } from '../leadhound/tavily.js';
import { resolveEmbedder } from './embedder.js';
import * as store from './store.js';

export function createResearchCompleter(scope, source = 'research') {
  const accessContext = createModelAccessContext({ userId: scope.userId, workspaceId: scope.workspaceId, source });
  return async (messages, { maxTokens = 700, temperature = 0.2 } = {}) => {
    const data = await callModel({
      accessContext,
      body: { messages, max_tokens: maxTokens, temperature },
      timeoutMs: 60000,
      logContext: { source },
      usageAttribution: { workspaceId: scope.workspaceId, actor: { kind: 'user', id: scope.userId }, source },
      usageSink: workspaceUsageSink,
    });
    return data?.choices?.[0]?.message?.content || '';
  };
}

/**
 * @param {{userId, workspaceId}} scope
 * @param {{ tavily?: 'required'|'optional'|'none' }} opts
 */
export async function researchDeps(scope, { tavily = 'required' } = {}) {
  let client = null;
  if (tavily !== 'none') {
    const { apiKey } = await resolveTavilyKey(scope.userId);
    if (apiKey || tavily === 'required') client = createTavilyClient(apiKey, { purpose: 'search with Tavily' });
  }
  return {
    tavily: client,
    embedder: await resolveEmbedder(scope.userId),
    store,
    complete: createResearchCompleter(scope),
  };
}
