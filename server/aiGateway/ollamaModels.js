// Chat must keep working when Ollama stops offering the model a chat names
// (the shipped default, the owner's AI_MODEL, or an agent's saved model).
// When Ollama answers "model not found", or the model is on the retired list,
// censaiOS reads Ollama's own live model list and sends to a model that is
// there. Nothing is asked of the person, and a working call costs no extra
// request.

import { isLocalBaseUrl, missingKeyError } from './missingKey.js';
import { createLogger } from '../logger.js';
import {
  SHIPPED_DEFAULT_CHAT_MODEL,
  isRetiredOllamaModel,
} from '../../shared/models/defaultChatModel.js';

const log = createLogger('ai');
const LIST_TIMEOUT_MS = 1500;
const LIST_CACHE_MS = 30_000;
const lists = new Map();
const missing = new Map(); // `${baseUrl} ${model}` -> when Ollama said it has no such model
const NOT_FOR_CHAT = /embed|bge|minilm|rerank|whisper|clip/i;

/**
 * Ollama's live model names, cached briefly. { reachable, models }: models is
 * null when Ollama answered but the list could not be read.
 */
export async function listOllamaModels(baseUrl, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const cached = lists.get(baseUrl);
  if (cached && now - cached.at < LIST_CACHE_MS) return cached.result;
  let result;
  try {
    const response = await fetchImpl(`${baseUrl}/models`, { signal: AbortSignal.timeout(LIST_TIMEOUT_MS) });
    let models = null;
    try {
      const data = response?.ok ? await response.json() : null;
      if (Array.isArray(data?.data)) models = data.data.map(entry => String(entry?.id || '')).filter(Boolean);
    } catch { models = null; }
    result = { reachable: true, models };
  } catch {
    result = { reachable: false, models: null };
  }
  lists.set(baseUrl, { at: now, result });
  return result;
}

export function clearOllamaModelCache() {
  lists.clear();
  missing.clear();
}

function knownMissing(baseUrl, model, now = Date.now()) {
  const at = missing.get(`${baseUrl} ${model}`);
  return Boolean(at) && now - at < LIST_CACHE_MS;
}

function sameModel(a, b) {
  const strip = name => String(name || '').trim().toLowerCase().replace(/:latest$/, '');
  return strip(a) === strip(b);
}

/**
 * The model to send to, given Ollama's live list. The wanted model when it is
 * listed and not retired; else the shipped default; else a cloud model; else
 * any chat model. Null when the list holds nothing chat can use.
 */
export function pickAvailableModel(wanted, models, now = new Date()) {
  const usable = (models || []).filter(name => !NOT_FOR_CHAT.test(name) && !isRetiredOllamaModel(name, now));
  const find = name => usable.find(candidate => sameModel(candidate, name));
  return find(wanted)
    || find(SHIPPED_DEFAULT_CHAT_MODEL)
    || usable.find(name => /[:-]cloud$/i.test(name))
    || usable[0]
    || null;
}

/** Calls this module checks: the local Ollama route, not a named provider. */
export function isLocalOllamaConfig(config) {
  const provider = String(config?.provider || '').toLowerCase();
  return (!provider || provider === 'ollama') && isLocalBaseUrl(config?.baseUrl);
}

/**
 * True when the local Ollama can answer this chat: it is running and offers
 * the model or a stand-in. An unreadable list counts as yes, as before.
 */
export async function localChatModelUsable(baseUrl, model, options = {}) {
  const { reachable, models } = await listOllamaModels(baseUrl, options);
  if (!reachable) return false;
  if (models === null) return true;
  return pickAvailableModel(model, models) !== null;
}

function wantedModel({ config, body }) {
  return body?.model || config?.model;
}

/** Ollama's answer when it does not have (or no longer serves) a model. */
export function isModelNotOffered(error) {
  if (error?.name !== 'ChatCompletionHttpError' || ![400, 404, 410].includes(Number(error.status))) return false;
  const text = String(error.body || '');
  return /model/i.test(text) && /not found|does not exist|no longer|retired|deprecated/i.test(text);
}

/**
 * The call with a model Ollama really offers. The same call when the model
 * is offered or the list can't be read. Throws the plain "no AI set up" error
 * when Ollama runs but offers nothing chat can use.
 */
export async function withOfferedModel(prepared, options = {}, { avoid = null } = {}) {
  const wanted = wantedModel(prepared);
  const { reachable, models } = await listOllamaModels(prepared.config.baseUrl, options);
  if (!reachable || models === null) return prepared;
  // A model Ollama just said it can't serve is passed over even if still listed.
  const model = pickAvailableModel(wanted, avoid ? models.filter(name => !sameModel(name, avoid)) : models);
  if (!model) throw missingKeyError(null);
  if (sameModel(model, wanted)) return prepared;
  log.warn('chat model not offered by Ollama, using another', { wanted, used: model });
  return {
    ...prepared,
    config: { ...prepared.config, model },
    body: prepared.body ? { ...prepared.body, model } : prepared.body,
  };
}

function notOfferedError(error, model) {
  return Object.assign(error, {
    code: 'MODEL_NOT_AVAILABLE',
    refusalSentence: `The model this chat uses (${model}) is no longer offered, and no other model was found to stand in. `
      + 'Pick another model from the model menu, or paste a key from Claude, OpenAI or OpenRouter.',
  });
}

/**
 * Sends a chat through the local Ollama so a retired or missing model never
 * ends it: a model known to be retired is swapped before sending, and an
 * Ollama "model not found" answer is retried once on a model Ollama offers.
 * Every other call is sent exactly as it was, with no extra request.
 */
export async function sendWithOfferedModel(prepared, send, options = {}) {
  if (!isLocalOllamaConfig(prepared?.config)) return send(prepared);
  let current = prepared;
  // Known gone (retired, or "not found" moments ago): swap before sending.
  const wanted = wantedModel(current);
  if (knownMissing(current.config.baseUrl, wanted)) {
    current = await withOfferedModel(current, options, { avoid: wanted });
  } else if (isRetiredOllamaModel(wanted)) {
    current = await withOfferedModel(current, options);
  }
  try {
    return await send(current);
  } catch (error) {
    if (!isModelNotOffered(error)) throw error;
    lists.delete(current.config.baseUrl);
    missing.set(`${current.config.baseUrl} ${wantedModel(current)}`, Date.now());
    const next = await withOfferedModel(current, options, { avoid: wantedModel(current) });
    if (next === current) throw notOfferedError(error, wantedModel(current));
    try {
      return await send(next);
    } catch (retryError) {
      throw isModelNotOffered(retryError) ? notOfferedError(retryError, wantedModel(next)) : retryError;
    }
  }
}
