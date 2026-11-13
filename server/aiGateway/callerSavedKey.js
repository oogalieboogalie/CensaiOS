// Chat applies the person's saved key before it calls the model. Remix,
// module builds and the other callers go through callModel and used to skip
// that step, so a key that already works in chat was reported as missing.
import { isLocalBaseUrl } from './missingKey.js';
import { borrowKeyedModel } from '../chatModel/keys.js';
import { getUserApiKeyConfig, inferUserApiKeyProvider } from '../security/userApiKeys.js';

/**
 * The key this person already saved, on the config chat would have used.
 * A named cloud provider uses that provider's vault key and no other.
 * The local default (Ollama, when nothing answers there) borrows a model
 * they do have a key for, same as chat.
 */
export async function applyCallerSavedKey(config, {
  userId = null,
  lookup = getUserApiKeyConfig,
  borrow = borrowKeyedModel,
} = {}) {
  if (!userId || !config) return config;
  const provider = inferUserApiKeyProvider(config.provider, config.baseUrl);
  if (provider) {
    let personal = null;
    try { personal = await lookup(userId, provider); } catch { personal = null; }
    if (personal?.apiKey) {
      return { ...config, apiKey: personal.apiKey, model: personal.modelName || config.model };
    }
    if (!isLocalBaseUrl(config.baseUrl)) return config;
  }
  const borrowed = await borrow({ userId, baseUrl: config.baseUrl });
  if (!borrowed?.apiKey) return config;
  return {
    ...config,
    provider: borrowed.provider,
    model: borrowed.model,
    baseUrl: borrowed.baseUrl,
    apiKey: borrowed.apiKey,
  };
}
