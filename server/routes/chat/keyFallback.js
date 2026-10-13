// A chat whose model runs on this computer (Ollama, the default) while
// nothing answers there borrows a model the person does have a key for, so a
// key pasted into the chat makes the very next message go through. When
// Ollama is running, or the person has no key at all, nothing changes.

import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { resolveChatModelConfig } from '../../aiGateway/index.js';
import { isLocalBaseUrl } from '../../aiGateway/missingKey.js';
import { getUserApiKeyConfig } from '../../security/userApiKeys.js';
import { MODEL_OPTIONS } from '../../../src/lib/agentModelOptions.js';

// Best first: the providers whose first listed model is a sound default.
export const FALLBACK_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'moonshot', 'opencode', 'cohere'];
const PROBE_TIMEOUT_MS = 1200;
const PROBE_CACHE_MS = 15_000;
const probes = new Map();

export async function localModelReachable(baseUrl, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const cached = probes.get(baseUrl);
  if (cached && now - cached.at < PROBE_CACHE_MS) return cached.ok;
  let ok = false;
  try {
    // Any answer at all means a model server is there; only silence is not.
    await fetchImpl(`${baseUrl}/models`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    ok = true;
  } catch {
    ok = false;
  }
  probes.set(baseUrl, { ok, at: now });
  return ok;
}

export function pickFallbackProvider(savedProviders) {
  const saved = new Set(savedProviders);
  return FALLBACK_PROVIDERS.find(provider => saved.has(provider)) || null;
}

export async function borrowKeyedModel({ userId, baseUrl, reachable = localModelReachable }) {
  if (!userId || !isLocalBaseUrl(baseUrl) || !dbReady()) return null;
  try {
    const { rows } = await pool.query('SELECT provider FROM user_api_keys WHERE user_id = $1', [userId]);
    const provider = pickFallbackProvider(rows.map(row => row.provider));
    if (!provider || await reachable(baseUrl)) return null;
    const key = await getUserApiKeyConfig(userId, provider);
    if (!key) return null;
    const config = resolveChatModelConfig({
      modelProvider: provider,
      modelName: key.modelName || MODEL_OPTIONS[provider]?.[0]?.value || null,
    });
    return { provider, model: config.model, baseUrl: config.baseUrl, apiKey: key.apiKey };
  } catch {
    return null; // best-effort: the chat then explains what is missing
  }
}
