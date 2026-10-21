// The key a person's chat sends with. One-to-one chat and group chat both use
// this, so a key saved in Settings works in either place. On a local install
// a teammate never keeps the owner's key from the setup file.

import { resolveFreeTierRuntime } from '../../aiGateway/freeTierRuntime.js';
import { requiresPersonalApiKey } from '../../security/byokPolicy.js';
import { scopeServerKey } from '../../security/serverKeys.js';
import { getUserApiKeyConfig, inferUserApiKeyProvider } from '../../security/userApiKeys.js';
import { borrowKeyedModel } from './keyFallback.js';

// Same shape as aiGateway ModelAccessError. Defined here so chat's key lookup
// does not pull the model-access barrel into every mock of that module.
class ModelAccessError extends Error {
  constructor(code, message, statusCode, retryAfter = null) {
    super(message);
    Object.assign(this, {
      name: 'ModelAccessError', code, status: statusCode, statusCode, retryAfter,
    });
  }
}

/**
 * Apply the person's saved key to a model config.
 * Vault keys win. Returns { provider, model, baseUrl, apiKey }.
 */
export async function applySavedChatKey({
  provider,
  model,
  baseUrl,
  apiKey,
  userId = null,
  userRole = null,
} = {}) {
  let nextProvider = provider;
  let nextModel = model;
  let nextBaseUrl = baseUrl;
  let nextApiKey = apiKey;

  // Personal vault keys win in every mode when present (local included);
  // server keys are the fallback. Lookup failures never block chat —
  // the cloud enforcement below still fails closed where it must.
  // (No console logging here: test harness fails on console output.)
  if (userId && nextProvider) {
    try {
      const personalProvider = inferUserApiKeyProvider(nextProvider, nextBaseUrl);
      const personal = personalProvider
        ? await getUserApiKeyConfig(userId, personalProvider)
        : null;
      if (personal) {
        nextApiKey = personal.apiKey;
        if (personal.modelName) nextModel = personal.modelName;
      }
    } catch {
      /* best-effort only */
    }
  }

  // Cloud SaaS users must supply credentials for paid providers.
  // Private servers use the server-managed route; a local install only for
  // its owner and whom they share keys with (scopeServerKey below).
  const centralFreeAccessEnabled = resolveFreeTierRuntime().enabled;
  if (userId && requiresPersonalApiKey(userRole) && !centralFreeAccessEnabled) {
    const url = String(nextBaseUrl || '');
    const isLocalProvider = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('host.docker.internal');
    const isFreeModel = nextProvider === 'openrouter' && String(nextModel || '').endsWith(':free');
    const credentialProvider = inferUserApiKeyProvider(nextProvider, nextBaseUrl);

    let userKeyConfig = null;
    try {
      userKeyConfig = await getUserApiKeyConfig(userId, credentialProvider);
    } catch (keyErr) {
      if (!isLocalProvider && !isFreeModel) {
        throw new ModelAccessError(
          'MODEL_ACCESS_UNAVAILABLE',
          'Unable to verify a personal API key',
          503,
          5,
        );
      }
      console.warn('[Tenancy] Personal key lookup failed:', keyErr.message);
    }

    if (userKeyConfig) {
      nextApiKey = userKeyConfig.apiKey;
      if (userKeyConfig.modelName) nextModel = userKeyConfig.modelName;
    } else if (!isLocalProvider && !isFreeModel) {
      throw Object.assign(new ModelAccessError(
        'MODEL_ACCESS_PERSONAL_KEY_REQUIRED',
        `"${nextModel}" requires a personal API key. Add one in Settings or use free AI access.`,
        403,
      ), { keyProvider: credentialProvider });
    }
  }

  // No Ollama answering here: use a model the person has a key for.
  const borrowed = await borrowKeyedModel({ userId, baseUrl: nextBaseUrl });
  if (borrowed) {
    nextProvider = borrowed.provider;
    nextModel = borrowed.model;
    nextBaseUrl = borrowed.baseUrl;
    nextApiKey = borrowed.apiKey;
  }

  // Local install: the .env keys are the owner's; a teammate uses their own unless shared.
  if (userId) {
    nextApiKey = (await scopeServerKey(
      { provider: nextProvider, baseUrl: nextBaseUrl, apiKey: nextApiKey },
      { userId, userRole },
    )).apiKey;
  }

  return { provider: nextProvider, model: nextModel, baseUrl: nextBaseUrl, apiKey: nextApiKey };
}
