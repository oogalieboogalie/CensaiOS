// Token streaming for OpenAI-compatible chat completions (spec 3). The HTTP
// call itself stays in chatCompletion.js; this file only parses the body.
//
// The chat loop still wants one assembled completion per round (tool calls,
// usage, finish reason), so this reads the SSE stream, forwards each content
// delta to `onDelta` as it arrives, and returns the same shape a
// non-streaming response would have had. Providers outside the allowlist, and
// any response that comes back as plain JSON, keep the old path.

const STREAMING_PROVIDERS = new Set(['openai', 'openrouter', 'ollama', 'google', 'moonshot', 'kimi', 'opencode']);
// Only these are known to accept stream_options; others would 400 on it.
const USAGE_STREAM_PROVIDERS = new Set(['openai', 'openrouter']);

export function canStreamChat(config) {
  return STREAMING_PROVIDERS.has(String(config?.provider || '').toLowerCase());
}

export function streamingPayload(config, payload) {
  const provider = String(config?.provider || '').toLowerCase();
  return {
    ...payload,
    stream: true,
    ...(USAGE_STREAM_PROVIDERS.has(provider) ? { stream_options: { include_usage: true } } : {}),
  };
}

export function isEventStream(response) {
  return String(response?.headers?.get?.('content-type') || '').includes('text/event-stream');
}

function mergeToolCallDelta(calls, delta) {
  const index = Number.isInteger(delta.index) ? delta.index : calls.length;
  const call = calls[index] || (calls[index] = { id: '', type: 'function', function: { name: '', arguments: '' } });
  if (delta.id) call.id = delta.id;
  if (delta.type) call.type = delta.type;
  if (delta.function?.name) call.function.name += delta.function.name;
  if (delta.function?.arguments) call.function.arguments += delta.function.arguments;
}

/** Folds parsed SSE chunks into one chat.completion object. Pure; exported for tests. */
export function createStreamAssembler(onDelta) {
  let content = '';
  let reasoning = '';
  let finishReason = null;
  let usage = null;
  let id = null;
  let model = null;
  const toolCalls = [];

  return {
    push(chunk) {
      if (!chunk || typeof chunk !== 'object') return;
      id = id || chunk.id || null;
      model = model || chunk.model || null;
      if (chunk.usage) usage = chunk.usage;
      const choice = chunk.choices?.[0];
      if (!choice) return;
      const delta = choice.delta || {};
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }
      const thought = delta.reasoning_content ?? delta.reasoning;
      if (typeof thought === 'string') reasoning += thought;
      if (Array.isArray(delta.tool_calls)) delta.tool_calls.forEach(d => mergeToolCallDelta(toolCalls, d));
      if (choice.finish_reason) finishReason = choice.finish_reason;
    },
    result() {
      const message = { role: 'assistant', content };
      if (reasoning) message.reasoning_content = reasoning;
      const calls = toolCalls.filter(Boolean);
      if (calls.length) message.tool_calls = calls;
      return {
        id,
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message, finish_reason: finishReason || (calls.length ? 'tool_calls' : 'stop') }],
        ...(usage ? { usage } : {}),
      };
    },
  };
}

/** Reads an SSE body to the end and returns the assembled completion. */
export async function readChatCompletionStream(response, onDelta) {
  const assembler = createStreamAssembler(onDelta);
  const decoder = new TextDecoder();
  let buffer = '';
  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') return;
    try {
      assembler.push(JSON.parse(data));
    } catch {
      // A malformed keep-alive or comment line; skip it.
    }
  };

  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    }
  } else if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const value of body) {
      buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(handleLine);
    }
  } else {
    buffer = await response.text();
  }
  buffer.split('\n').forEach(handleLine);
  return assembler.result();
}
