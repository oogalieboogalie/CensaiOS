import pool from '../db.js';
import { decryptKey } from './vault.js';

const PROVIDER_ALIASES = new Map([
  ['google-native', 'google'],
  ['kimi', 'moonshot'],
]);

export const USER_API_KEY_PROVIDERS = Object.freeze([
  'cohere',
  'openrouter',
  'openai',
  'google',
  'moonshot',
  'opencode',
]);

export function normalizeUserApiKeyProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  const normalized = PROVIDER_ALIASES.get(provider) || provider;
  return USER_API_KEY_PROVIDERS.includes(normalized) ? normalized : null;
}

export function inferUserApiKeyProvider(provider, baseUrl) {
  const normalized = normalizeUserApiKeyProvider(provider);
  if (normalized) return normalized;

  const url = String(baseUrl || '').toLowerCase();
  if (url.includes('cohere.ai')) return 'cohere';
  if (url.includes('openrouter.ai')) return 'openrouter';
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('googleapis.com') || url === 'google-native') return 'google';
  if (url.includes('moonshot.cn')) return 'moonshot';
  if (url.includes('opencode.ai')) return 'opencode';
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
