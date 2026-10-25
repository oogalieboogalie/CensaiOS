import { getSecret } from './secrets.js';

// Non-Gemini Google Cloud APIs, such as YouTube Data API v3, need their own
// API key. Never fall back to GEMINI_API_KEY for these.
export function getGeminiApiKey(fallbackKey = '') {
  return getSecret('GEMINI_API_KEY') || getSecret('GOOGLE_API_KEY') || fallbackKey;
}

/** The setup file (.env): YOUTUBE_API_KEY, then GOOGLE_CLOUD_API_KEY. */
export function getYouTubeApiKey() {
  return getSecret('YOUTUBE_API_KEY') || getSecret('GOOGLE_CLOUD_API_KEY') || '';
}

// The setup-file key is the owner's (security/serverKeys.js): only the owner,
// or someone the owner shares keys with, falls back to it.
async function ownerMayUse({ userId }) {
  const { mayUseServerKeys } = await import('./security/serverKeys.js');
  return mayUseServerKeys({ userId });
}

// Saved vault key first, the setup file second. Same order as resolveTavilyKey.
// A key the vault only borrowed from the setup file (source 'env') is not a
// saved key. A vault read failure falls through to the setup file.
export async function resolveYouTubeKey(userId, { loadUserKey, setupKey = getYouTubeApiKey, mayUse = ownerMayUse } = {}) {
  const load = loadUserKey || (async (id) => {
    const { getUserApiKeyConfig } = await import('./security/userApiKeys.js');
    return getUserApiKeyConfig(id, 'youtube');
  });
  try {
    const userKey = userId ? await load(userId) : null;
    if (userKey?.apiKey && userKey.source !== 'env') {
      return { apiKey: userKey.apiKey, source: 'saved key' };
    }
  } catch {
    // A vault read failure falls through to the setup file.
  }
  const fileKey = setupKey();
  if (fileKey && userId && !(await mayUse({ userId }).catch(() => false))) {
    const { logServerKeyHeldBack } = await import('./security/serverKeys.js');
    logServerKeyHeldBack('youtube', userId);
    return { apiKey: '', source: null };
  }
  if (fileKey) return { apiKey: fileKey, source: 'setup file' };
  return { apiKey: '', source: null };
}
