// Model arena: one prompt, up to four models, replies streamed side by side.
// This file runs one lane (one model): it finds the key the same way chats
// do (your saved key first, the server's key as the fallback where that is
// allowed), streams the reply, and times it.
import { requestChatCompletion, resolveChatModelConfig } from '../aiGateway/index.js';
import { isLocalBaseUrl, missingKeyError, tagRejectedKey } from '../aiGateway/missingKey.js';
import { getUserApiKeyConfig, inferUserApiKeyProvider } from '../security/userApiKeys.js';
import { requiresPersonalApiKey } from '../security/byokPolicy.js';
import { publicChatError } from '../routes/chat/httpErrors.js';

export const ARENA_MAX_LANES = 4;
export const ARENA_TIMEOUT_MS = 90_000;
export const ARENA_PROVIDERS = Object.freeze([
  'anthropic', 'google', 'openai', 'openrouter', 'ollama', 'xai', 'moonshot', 'opencode', 'zai', 'cohere',
]);

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Checks the request body. Returns { error } or the cleaned request. */
export function parseArenaRequest(body = {}) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 40_000) : '';
  if (!prompt.trim()) return { error: 'Type a request to send.' };
  const models = Array.isArray(body.models) ? body.models : [];
  if (!models.length) return { error: 'Pick at least one model.' };
  if (models.length > ARENA_MAX_LANES) return { error: `Pick at most ${ARENA_MAX_LANES} models.` };
  const lanes = [];
  for (const entry of models) {
    const provider = text(entry?.provider, 40).toLowerCase();
    const model = text(entry?.model, 120);
    if (!ARENA_PROVIDERS.includes(provider) || !model) return { error: 'One of the picked models is not one the arena knows.' };
    lanes.push({ provider, model });
  }
  const maxTokens = Math.min(4096, Math.max(64, Number(body.maxTokens) || 1024));
  return { prompt, system: text(body.system, 8000), lanes, maxTokens };
}

/** The model config for one lane, with the key that will pay for it. */
export async function laneConfig({ provider, model }, { userId = null, role = 'user' } = {}) {
  const config = resolveChatModelConfig({ modelProvider: provider, modelName: model });
  const keyProvider = inferUserApiKeyProvider(config.provider, config.baseUrl);
  let personal = null;
  if (userId && keyProvider) {
    try { personal = await getUserApiKeyConfig(userId, keyProvider); } catch { personal = null; }
  }
  // Keep the model picked here, not the default saved with the key.
  if (personal) return { ...config, apiKey: personal.apiKey };
  if (requiresPersonalApiKey(role) && !isLocalBaseUrl(config.baseUrl)) throw missingKeyError(keyProvider);
  return config;
}

function usageOf(data, prompt, reply) {
  const usage = data?.usage || {};
  const input = Number(usage.prompt_tokens ?? usage.input_tokens);
  const output = Number(usage.completion_tokens ?? usage.output_tokens);
  if (Number.isFinite(input) && Number.isFinite(output) && (input || output)) {
    return { input, output, estimated: false };
  }
  // Some providers send no counts while streaming: about 4 letters a token.
  return { input: Math.ceil(prompt.length / 4), output: Math.ceil(reply.length / 4), estimated: true };
}

/**
 * Runs one lane and reports it through `emit` as start, delta..., then done
 * or error. Never throws: one lane failing leaves the others running.
 */
export async function runLane({ lane, spec, request, account, emit, now = Date.now }) {
  const { prompt, system, maxTokens } = request;
  const started = now();
  let firstTokenMs = null;
  let reply = '';
  try {
    const config = await laneConfig(spec, account);
    emit({ type: 'start', lane, provider: config.provider, model: config.model });
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ];
    const data = await requestChatCompletion({
      config,
      body: { messages, max_tokens: maxTokens },
      timeoutMs: ARENA_TIMEOUT_MS,
      retry: { maxRetries: 0, max429Retries: 0 },
      logContext: { route: 'model-arena', lane },
      onDelta: (delta) => {
        if (firstTokenMs === null) firstTokenMs = now() - started;
        reply += delta;
        emit({ type: 'delta', lane, text: delta });
      },
    });
    const full = String(data?.choices?.[0]?.message?.content ?? '');
    // A provider that does not stream hands the whole reply over at the end.
    if (!reply && full) {
      firstTokenMs = now() - started;
      reply = full;
      emit({ type: 'delta', lane, text: full });
    }
    emit({
      type: 'done',
      lane,
      model: data?.model || config.model,
      firstTokenMs,
      totalMs: now() - started,
      usage: usageOf(data, (system || '') + prompt, reply),
      finishReason: data?.choices?.[0]?.finish_reason || null,
    });
  } catch (error) {
    const tagged = tagRejectedKey(error, spec.provider);
    emit({ type: 'error', lane, totalMs: now() - started, error: publicChatError(tagged).body });
  }
}
