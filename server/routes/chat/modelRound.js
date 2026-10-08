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
  onDelta = null,
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
    onDelta,
  });
}

/**
 * Spec 3: forward text as the model writes it. The first delta proves the
 * provider accepted the request, so `onFirst` can open the NDJSON stream.
 */
export function forwardDeltas(round, sendEvent, onFirst) {
  return (text) => {
    onFirst?.();
    sendEvent({ type: 'delta', round, text });
  };
}

/** The person pressed stop (the browser closed the stream): run no more rounds or tools. */
export function throwIfChatAborted(signal) {
  if (!signal?.aborted) return;
  throw Object.assign(new Error('Stopped'), { code: 'CHAT_ABORTED', statusCode: 499 });
}
