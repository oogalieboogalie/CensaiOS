// Which key each agent spends when this person talks to it. An agent has a
// provider and a model; the person's own key for that provider pays, else
// this computer's key when the owner lets them use it, else nothing (the
// chat asks for a key). Models on this computer (Ollama) need no key. An
// agent left on censaiOS's default model borrows the person's first key when
// the default (Ollama) is not running, exactly as the chat does
// (routes/chat/keyFallback.js).

import { getAgents } from '../memory/core/agents.js';
import { inferUserApiKeyProvider } from '../security/userApiKeys.js';
import { mayUseServerKeys } from '../security/serverKeys.js';
import { isLocalBaseUrl } from '../aiGateway/missingKey.js';
import { resolveChatModelConfig } from '../aiGateway/index.js';
import { borrowKeyedModel } from '../routes/chat/keyFallback.js';

const LOCAL = new Set(['ollama', 'local', 'lmstudio']);

function viaHeldKey(base, provider, held, serverKeysOk) {
  const key = held.find((k) => k.provider === provider);
  if (key) return { ...base, provider, route: key.source, keyId: key.keyId };
  return { ...base, provider, route: serverKeysOk ? 'shared' : 'missing' };
}

export function agentKeyRoute(agent, held, { serverKeysOk, fallback = null, defaultLocal = true }) {
  const raw = String(agent.model_provider || '').toLowerCase();
  const base = { id: agent.id, name: agent.name, provider: raw || null, model: agent.model_name || null };
  if (!raw) {
    if (fallback) return viaHeldKey({ ...base, model: fallback.model, borrowed: true }, fallback.provider, held, serverKeysOk);
    return { ...base, route: defaultLocal ? 'local' : 'default' };
  }
  if (LOCAL.has(raw) || isLocalBaseUrl(agent.base_url || '')) return { ...base, route: 'local' };
  return viaHeldKey(base, inferUserApiKeyProvider(raw, agent.base_url) || raw, held, serverKeysOk);
}

async function defaultModel(userId) {
  const baseUrl = resolveChatModelConfig().baseUrl;
  const borrowed = await borrowKeyedModel({ userId, baseUrl }).catch(() => null);
  // Only which provider and model; the borrowed key itself is dropped here.
  return { fallback: borrowed ? { provider: borrowed.provider, model: borrowed.model } : null, defaultLocal: isLocalBaseUrl(baseUrl) };
}

export async function agentRoutes({ userId, userRole, held, loadAgents = getAgents, mayUse = mayUseServerKeys, defaults = defaultModel }) {
  const [agents, serverKeysOk, { fallback, defaultLocal }] = await Promise.all([
    loadAgents().catch(() => []),
    mayUse({ userId, userRole }).catch(() => false),
    defaults(userId).catch(() => ({ fallback: null, defaultLocal: true })),
  ]);
  return agents.slice(0, 300).map((agent) => agentKeyRoute(agent, held, { serverKeysOk, fallback, defaultLocal }));
}
