import pool from '../db.js';
import { decryptKey } from './vault.js';

const PROVIDER_ALIASES = new Map([
  ['google-native', 'google'],
  ['kimi', 'moonshot'],
  ['claude', 'anthropic'],
  ['glm', 'zai'],
  ['z.ai', 'zai'],
  ['grok', 'xai'],
  ['x-ai', 'xai'],
  ['eleven-labs', 'elevenlabs'],
]);

export const USER_API_KEY_PROVIDERS = Object.freeze([
  'cohere',
  'openrouter',
  'openai',
  'google',
  'moonshot',
  'opencode',
  'figma',
  'tavily',
  'anthropic',
  'github',
  'zai',
  'xai',
  'elevenlabs',
]);

export function normalizeUserApiKeyProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  const normalized = PROVIDER_ALIASES.get(provider) || provider;
  return USER_API_KEY_PROVIDERS.includes(normalized) ? normalized : null;
}

export function inferUserApiKeyProvider(provider, baseUrl) {
  const normalized = normalizeUserApiKeyProvider(provider);
  if (normalized) return normalized;

  const raw = String(baseUrl || '').trim().toLowerCase();
  if (raw === 'google-native') return 'google';

  // Match on the parsed hostname, never a substring of the whole URL, so
  // "https://evil.example/?x=api.openai.com" is not mistaken for OpenAI.
  let hostname = '';
  try {
    hostname = new URL(raw).hostname;
  } catch {
    try {
      hostname = new URL(`https://${raw}`).hostname;
    } catch {
      hostname = '';
    }
  }
  if (!hostname) return null;

  const isHost = (domain) => hostname === domain || hostname.endsWith(`.${domain}`);
  if (isHost('cohere.ai')) return 'cohere';
  if (isHost('openrouter.ai')) return 'openrouter';
  if (hostname === 'api.openai.com') return 'openai';
  if (isHost('googleapis.com')) return 'google';
  if (isHost('moonshot.cn')) return 'moonshot';
  if (isHost('opencode.ai')) return 'opencode';
  if (isHost('anthropic.com')) return 'anthropic';
  if (hostname === 'api.z.ai') return 'zai';
  if (hostname === 'api.x.ai') return 'xai';
  return null;
}

export async function getUserApiKeyConfig(userId, provider) {
  const storedProvider = normalizeUserApiKeyProvider(provider);
  if (!userId || !storedProvider) return null;

  const { rows } = await pool.query(
    `SELECT api_key_encrypted, base_url, model_name
     FROM user_api_keys
     WHERE user_id = $1 AND provider = $2`,
    [userId, storedProvider]
  );
  if (!rows.length) return null;

  return {
    apiKey: decryptKey(rows[0].api_key_encrypted, userId),
    modelName: rows[0].model_name || null,
  };
}
