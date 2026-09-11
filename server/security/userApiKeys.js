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

  const raw = String(baseUrl || '').trim().toLowerCase();
  if (raw === 'google-native') return 'google';

  let hostname = '';
  try {
    hostname = new URL(raw).hostname.toLowerCase();
  } catch {
    try {
      hostname = new URL(`https://${raw}`).hostname.toLowerCase();
    } catch {
      hostname = '';
    }
  }

  if (!hostname) return null;

  if (hostname === 'cohere.ai' || hostname.endsWith('.cohere.ai')) return 'cohere';
  if (hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai')) return 'openrouter';
  if (hostname === 'api.openai.com') return 'openai';
  if (hostname === 'googleapis.com' || hostname.endsWith('.googleapis.com')) return 'google';
  if (hostname === 'moonshot.cn' || hostname.endsWith('.moonshot.cn')) return 'moonshot';
  if (hostname === 'opencode.ai' || hostname.endsWith('.opencode.ai')) return 'opencode';
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
