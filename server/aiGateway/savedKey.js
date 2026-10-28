// The key a person saved in Settings wins over the server's setup file (.env)
// for every model call made for them, the same rule chat follows
// (routes/chat/savedChatKey.js). Idea Pad, agent icons, design remix, agent
// wake-ups, module making and task workers all reach the model through
// callModel with a config built from .env; this swaps in the saved key.
//
// Only a config carrying no key or the server's own key is changed, so a key a
// caller already chose (an arena lane, a hosted agent) is never replaced.
// Models running on this computer need no key and are left alone.

import { isLocalBaseUrl } from './missingKey.js';
import { isServerKeyValue } from '../security/serverKeys.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('model-keys');

function carriesNoOwnKey(apiKey) {
  const key = String(apiKey || '').trim();
  return !key || key === 'ollama' || isServerKeyValue(key);
}

async function vaultLookup(userId, provider) {
  const { getUserApiKeyConfig } = await import('../security/userApiKeys.js');
  return getUserApiKeyConfig(userId, provider);
}

async function keyProviderOf(config) {
  const { inferUserApiKeyProvider } = await import('../security/userApiKeys.js');
  return inferUserApiKeyProvider(config.provider, config.baseUrl);
}

/**
 * Returns the config with the person's saved key for its provider, when they
 * have one. A key the vault only borrowed from .env (source 'env') is not a
 * saved key. A failed lookup keeps the config as it was.
 */
export async function useSavedKey(config, userId, {
  lookupKey = vaultLookup,
  providerOf = keyProviderOf,
} = {}) {
  if (!config || !userId || isLocalBaseUrl(config.baseUrl)) return config;
  if (!carriesNoOwnKey(config.apiKey)) return config;
  try {
    const provider = await providerOf(config);
    if (!provider) return config;
    const saved = await lookupKey(userId, provider);
    if (!saved?.apiKey || saved.source === 'env') return config;
    return { ...config, apiKey: saved.apiKey };
  } catch (err) {
    log.warn('saved key lookup failed, using the setup file key', { code: safeErrorCode(err) });
    return config;
  }
}
