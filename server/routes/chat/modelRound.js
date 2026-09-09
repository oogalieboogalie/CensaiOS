import {
  callModel,
  createModelAccessContext,
  workspaceUsageSink,
} from '../../aiGateway/index.js';

export function chatModelAccessContext(userId, workspaceId) {
  if (!userId || !workspaceId) return null;
  return createModelAccessContext({
    userId,
    workspaceId,
    source: 'chat-loop',
  });
}

export function callChatModelRound({
  accessContext,
  activeTools,
  chatMessages,
  includeTools,
  reqApiKey,
  reqBaseUrl,
  reqModel,
  reqProvider,
  round,
  userId,
  workspaceId,
}) {
  const body = {
    model: reqModel,
    max_tokens: 4096,
    messages: chatMessages,
    ...(activeTools.length > 0 && includeTools ? { tools: activeTools } : {}),
  };
  return callModel({
    config: {
      provider: reqProvider,
      model: reqModel,
      baseUrl: reqBaseUrl,
      apiKey: reqApiKey,
    },
    body,
    logContext: { source: 'chat-loop', round },
    usageAttribution: {
      workspaceId,
      actor: { kind: 'user', id: userId || 'local-user' },
      source: 'chat-loop',
    },
    usageSink: workspaceUsageSink,
    accessContext,
  });
}
