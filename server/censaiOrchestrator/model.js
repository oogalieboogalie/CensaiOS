// Censai the orchestrator: Censai's own model, for reading a job's answer over and
// for the one line the person reads at the end. Same model and key as
// Censai's chat (the person's own key, through prepareChatContext), no tools.

import { prepareChatContext } from '../routes/chat/chatContext.js';
import { callChatModelRound, chatModelAccessContext } from '../routes/chat/modelRound.js';
import { withReasoningContentFallback } from '../routes/chat/reasoningFallback.js';

export function replyText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n').trim();
  }
  return '';
}

/** Censai's model for this person and board: { model, baseUrl, apiKey, provider, workspaceId }. */
export async function censaiModel({ userId, workspaceId, goal, prepare = prepareChatContext }) {
  const context = await prepare('censai', null, [{ from: 'me', text: goal }], userId, null, workspaceId);
  return {
    model: context.reqModel,
    baseUrl: context.reqBaseUrl,
    apiKey: context.reqApiKey,
    provider: context.reqProvider,
    workspaceId: context.workspaceId || workspaceId,
  };
}

/**
 * One answer from Censai's model, as plain text (empty when it sent none).
 * reasoning: false leaves out a model's thinking when it sent no answer, so a
 * draft is never what the person reads.
 */
export async function askCensai(model, messages, { userId, round = 1, reasoning = true, call = callChatModelRound } = {}) {
  const data = await call({
    accessContext: chatModelAccessContext(userId, model.workspaceId),
    activeTools: [],
    chatMessages: messages,
    includeTools: false,
    reqApiKey: model.apiKey,
    reqBaseUrl: model.baseUrl,
    reqModel: model.model,
    reqProvider: model.provider,
    round,
    userId,
    workspaceId: model.workspaceId,
  });
  const message = data?.choices?.[0]?.message;
  return replyText(reasoning ? withReasoningContentFallback(message) : message);
}
