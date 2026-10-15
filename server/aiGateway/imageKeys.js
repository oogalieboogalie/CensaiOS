// Which Google key an image request spends: the caller's own first (their
// vault key, or the owner's .env key on a local install), then the server's
// key only for those allowed to use it (security/serverKeys.js). Nobody else
// spends the owner's Google credit; they are asked for their own key.

import { getUserApiKeyConfig } from '../security/userApiKeys.js';
import { mayUseServerKeys } from '../security/serverKeys.js';
import { missingKeyError } from './missingKey.js';

export const IMAGE_KEY_MESSAGE = 'Images are made with Google Gemini, and no Google Gemini key is saved for you yet. Add your own key in Settings → Vault (Google Gemini), then try again.';

export async function imageConfigForCaller(config, { userId = null, userRole = null } = {}, deps = {}) {
  const lookup = deps.getUserApiKeyConfig || getUserApiKeyConfig;
  const allowServer = deps.mayUseServerKeys || mayUseServerKeys;
  let personal = null;
  if (userId) {
    try {
      personal = await lookup(userId, 'google');
    } catch {
      personal = null;
    }
  }
  if (personal?.apiKey) return { ...config, apiKey: personal.apiKey };
  if (config?.apiKey && await allowServer({ userId, userRole })) return config;
  throw missingKeyError('google', { message: IMAGE_KEY_MESSAGE });
}
