/**
 * Normalizers for providers that deviate from the OpenAI message shape.
 *
 * Some reasoning models (e.g. NVIDIA Nemotron via gateways) return HTTP 200
 * with an empty `content` and the actual text in `reasoning_content`, or
 * `function.arguments` as an object instead of a JSON string. Without these,
 * the loop sees "no tool calls and no text" and reports "No response
 * generated." Follows the precedent in longcatToolCalls.js.
 */

export function withReasoningContentFallback(message) {
  if (!message || message.tool_calls?.length) return message;
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  if (text) return message;
  const reasoning = message.reasoning_content ?? message.reasoning ?? null;
  const reasoningText = typeof reasoning === 'string'
    ? reasoning.trim()
    : Array.isArray(reasoning)
      ? reasoning.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n').trim()
      : '';
  if (!reasoningText) return message;
  return { ...message, content: reasoningText, reasoning_used_as_content: true };
}

export function normalizeToolCallArguments(rawArgs) {
  if (rawArgs === undefined || rawArgs === null) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  return JSON.parse(String(rawArgs) || '{}');
}

/** Keys + sizes for diagnosing empty responses (no content logged). */
export function describeChoiceShape(choice) {
  const message = choice?.message || {};
  const info = { hasChoice: Boolean(choice) };
  for (const key of Object.keys(message)) {
    const value = message[key];
    info[key] = typeof value === 'string' ? `${value.length} chars` : (value === null ? null : typeof value);
  }
  if (choice && !choice.message) info.message = 'missing';
  return info;
}

/** Emit a diagnostic status event when the model round yielded nothing usable. */
export function reportEmptyModelResponse(sendEvent, reqModel, choice, msg) {
  if (msg?.content?.trim?.() || msg?.tool_calls?.length > 0) return;
  try {
    sendEvent?.({
      type: 'status', status: 'empty_model_response',
      detail: { model: reqModel, shape: describeChoiceShape(choice) },
    });
  } catch { /* diagnostics never break the loop */ }
}
