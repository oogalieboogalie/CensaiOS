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

// The reply budget for one model call. Thinking models (Gemini 2.5 and 3,
// OpenAI o-series) spend part of it thinking before they write, so a big turn
// can use all of it up and come back with nothing ("held back its reply: it
// hit its length limit"). Then that round is asked once more with room to
// answer. The everyday budget stays small, because some providers refuse a
// budget above their model's own limit.
export const CHAT_MAX_TOKENS = 4096;
export const ROOMY_MAX_TOKENS = 16384;

/** True when the model stopped at its length limit before writing any text or tool call. */
export function ranOutBeforeWriting(choice) {
  const reason = choice?.finish_reason || choice?.finishReason;
  if (reason !== 'length' && reason !== 'MAX_TOKENS') return false;
  const message = choice?.message || {};
  const content = message.content;
  const text = typeof content === 'string'
    ? content.trim()
    : Array.isArray(content) ? content.map((part) => part?.text || '').join('').trim() : '';
  return !text && !(message.tool_calls?.length > 0);
}

export function callChatModelRound({
  maxTokens = CHAT_MAX_TOKENS,
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
  agentId = null,
  windowId = null,
  onDelta = null,
}) {
  const body = {
    model: reqModel,
    max_tokens: maxTokens,
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
      // Which agent and chat window spent it (the AI resources window).
      ...(agentId ? { agentId } : {}),
      ...(windowId ? { windowId } : {}),
    },
    usageSink: workspaceUsageSink,
    accessContext,
    onDelta,
  });
}

/**
 * One model call, asked once more with ROOMY_MAX_TOKENS when the model ran out
 * before writing anything. If that second call fails (a provider that caps
 * its budget lower), the first answer stands and the person sees why.
 */
export async function callWithRoomToAnswer(args, { call = callChatModelRound, onRetry = null, signal = null } = {}) {
  const first = await call(args);
  if ((args.maxTokens ?? CHAT_MAX_TOKENS) >= ROOMY_MAX_TOKENS) return first;
  // The native Gemini route does not send this budget (it uses the model's own
  // maximum), so asking again there would only repeat the same call.
  if (args.reqProvider === 'google-native') return first;
  if (!ranOutBeforeWriting(first?.choices?.[0])) return first;
  throwIfChatAborted(signal);
  onRetry?.();
  let second;
  try {
    second = await call({ ...args, maxTokens: ROOMY_MAX_TOKENS });
  } catch (err) {
    if (err?.code === 'CHAT_ABORTED') throw err;
    return first;
  }
  return { ...second, usage: addUsage(first?.usage, second?.usage) };
}

// Both calls were spent, so the receipt counts both.
function addUsage(a, b) {
  if (!a) return b;
  if (!b) return a;
  const sum = (key, alt) => (Number(a[key] ?? a[alt]) || 0) + (Number(b[key] ?? b[alt]) || 0);
  return { ...b, prompt_tokens: sum('prompt_tokens', 'input_tokens'), completion_tokens: sum('completion_tokens', 'output_tokens') };
}

/** Token counts for one model call, for agent receipts (zero when the provider sent none). */
export function modelTokens(usage) {
  const tokensIn = Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0;
  const tokensOut = Number(usage?.completion_tokens ?? usage?.output_tokens) || 0;
  return { tokens_in: tokensIn, tokens_out: tokensOut };
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
