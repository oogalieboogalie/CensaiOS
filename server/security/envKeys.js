// Keys from the server's .env file, for the person who owns this computer.
//
// On a local install (CENSAI_MODE=local_desktop: npm run dev, the Docker
// stack on 3002, the laptop app) the owner usually already has their keys in
// the .env at the repo root. Their account uses those keys as if they were in
// the key vault, so they never type them in again. Nothing is copied into the
// database, and key values never leave the server: the vault only learns that
// a provider has a key "from your .env file".
//
// Only the owner (the install's admin, the first account made on it) gets
// them. Teammates, share-link guests and agents working for someone else
// bring their own keys. Cloud and private-server installs never do this.
// CENSAI_ENV_KEYS=off turns it off.

import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

// Provider id (as the key vault names it) -> .env names, most usual first.
export const ENV_KEY_NAMES = Object.freeze({
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  moonshot: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  opencode: ['OPENCODE_API_KEY', 'OPENCODE_ZEN_API_KEY'],
  cohere: ['COHERE_API_KEY', 'COHERE_PAID_API_KEY', 'COHERE_NON_COMMERCIAL_KEY'],
  xai: ['XAI_API_KEY', 'GROK_API_KEY'],
  zai: ['ZAI_API_KEY', 'GLM_API_KEY', 'ZHIPU_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY'],
  tavily: ['TAVILY_API_KEY'],
  figma: ['FIGMA_API_TOKEN', 'FIGMA_TOKEN', 'FIGMA_ACCESS_TOKEN'],
  github: ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT'],
  langsmith: ['LANGSMITH_API_KEY', 'LANGGRAPH_API_KEY', 'LANGCHAIN_API_KEY'],
});

// Stand-ins that mean "no key here", never a real key.
const PLACEHOLDERS = new Set(['', 'ollama', 'changeme', 'your-key-here', 'xxx']);

/**
 * Claude Pro/Max sign-in tokens (sk-ant-oat...) are never used by censaiOS,
 * from the key box or from .env (same rule as subscriptionTokenProblem).
 */
export function isSubscriptionToken(provider, value) {
  return provider === 'anthropic' && /^sk-ant-oat/i.test(String(value || '').trim());
}

/** The .env key for a provider, or null. Never a subscription token. */
export function envKeyFor(provider, env = process.env) {
  for (const name of ENV_KEY_NAMES[provider] || []) {
    const value = typeof env[name] === 'string' ? env[name].trim() : '';
    if (PLACEHOLDERS.has(value.toLowerCase()) || /^<.*>$/.test(value)) continue;
    if (isSubscriptionToken(provider, value)) continue;
    return value;
  }
  return null;
}

/** Providers that have a usable key in .env, by id only (no values). */
export function envKeyProviders(env = process.env) {
  return Object.keys(ENV_KEY_NAMES).filter((provider) => envKeyFor(provider, env));
}

/** Whether this install shares its .env keys with its owner at all. */
export function envKeysEnabled({ env = process.env, mode = getRuntimeMode() } = {}) {
  if (['off', 'false', '0', 'no'].includes(String(env.CENSAI_ENV_KEYS || '').trim().toLowerCase())) return false;
  return mode === RUNTIME_MODES.LOCAL_DESKTOP;
}

/** The owner of a local install is its admin (the first account made on it). */
export function isEnvKeyOwnerRole(role, options = {}) {
  return envKeysEnabled(options) && String(role || '').toLowerCase() === 'admin';
}

async function roleOf(db, userId) {
  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0]?.role || null;
}

/**
 * The owner's .env key for a provider as a vault-shaped config, or null for
 * anyone else. `db` is the pool (injectable for tests).
 */
export async function ownerEnvKeyConfig(db, userId, provider, options = {}) {
  if (!userId || !envKeysEnabled(options)) return null;
  const apiKey = envKeyFor(provider, options.env);
  if (!apiKey) return null;
  if (!isEnvKeyOwnerRole(await roleOf(db, userId), options)) return null;
  return { apiKey, modelName: null, source: 'env' };
}

/** Providers the owner gets from .env (empty for anyone else). */
export async function ownerEnvKeyProviders(db, userId, options = {}) {
  if (!userId || !envKeysEnabled(options)) return [];
  const providers = envKeyProviders(options.env);
  if (!providers.length) return [];
  return isEnvKeyOwnerRole(await roleOf(db, userId), options) ? providers : [];
}
