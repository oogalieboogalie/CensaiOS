// Legion: one model call for one role. Keys work the same way as the model
// arena (server/modelArena/runLane.js): the person's own saved key first,
// the server's key only where that is allowed. Any model can fill any role.
import { requestChatCompletion } from '../aiGateway/index.js';
import { tagRejectedKey } from '../aiGateway/missingKey.js';
import { laneConfig, ARENA_PROVIDERS } from '../modelArena/runLane.js';
import { publicChatError } from '../routes/chat/httpErrors.js';

export const LEGION_CALL_TIMEOUT_MS = 180_000;
export const LEGION_MAX_TOKENS = 16_000;

/** A model pick { provider, model } the Legion accepts, or null. */
export function cleanModelSpec(spec) {
  const provider = String(spec?.provider || '').trim().toLowerCase();
  const model = String(spec?.model || '').trim().slice(0, 120);
  if (!ARENA_PROVIDERS.includes(provider) || !model) return null;
  return { provider, model };
}

function userContent(prompt, images) {
  if (!images?.length) return prompt;
  return [
    { type: 'text', text: prompt },
    ...images.map((image) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${image.toString('base64')}` } })),
  ];
}

/** Rejects as soon as `signal` aborts, so Stop ends a run without waiting on the model. */
function untilStopped(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(Object.assign(new Error('Stopped.'), { stopped: true }));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * Ask one model. Returns { text, model, ms }. Throws an Error with a plain
 * message when the model or key fails, so the run can stop and say why.
 */
export async function callModel({ spec, account, system, prompt, images = [], signal, label = 'legion' }) {
  const started = Date.now();
  let config;
  try {
    config = await laneConfig(spec, account);
    const data = await untilStopped(requestChatCompletion({
      config,
      body: {
        messages: [{ role: 'system', content: system }, { role: 'user', content: userContent(prompt, images) }],
        max_tokens: LEGION_MAX_TOKENS,
      },
      timeoutMs: LEGION_CALL_TIMEOUT_MS,
      retry: { maxRetries: 1, max429Retries: 1 },
      logContext: { route: 'legion', role: label },
    }), signal);
    const text = String(data?.choices?.[0]?.message?.content ?? '');
    return { text, model: data?.model || config.model, ms: Date.now() - started };
  } catch (error) {
    if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { stopped: true });
    const tagged = tagRejectedKey(error, spec.provider);
    const body = publicChatError(tagged).body || {};
    throw new Error(body.error || body.message || error.message || 'The model did not answer.', { cause: error });
  }
}
