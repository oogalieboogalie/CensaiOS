// Who may fall back to the keys in the server's .env file.
//
// On a local install those keys belong to the person who owns the computer.
// Image, video and voice calls spend real money on them, so only the owner
// (the install's admin, the first account made on it) may use them.
// Teammates, share-link guests and agents working for someone else bring
// their own keys and get the plain "add your key" message when they have
// none. A private team server keeps its managed keys for everyone (same as
// chat there), and the cloud only lets its admins and operators use them.
// On a local install the owner can also share their keys with chosen
// accounts (Settings, AI keys, "Share my AI keys with": keySharing.js).

import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { resolveChatModelConfig } from '../aiGateway/providers.js';
import { isLocalBaseUrl, missingKeyError, missingKeyMessage } from '../aiGateway/missingKey.js';
import { ENV_KEY_NAMES } from './envKeys.js';
import { isKeySharedWith } from './keySharing.js';
import { createLogger } from '../logger.js';

const log = createLogger('server-keys');

/** One line when a server key is kept from someone: the service and the numeric user id, never the key. */
export function logServerKeyHeldBack(service, userId) {
  log.info('server key held back', { service: service || 'unknown', userId: Number(userId) > 0 ? Number(userId) : null });
}

const OWNER_ROLES = new Set(['admin', 'operator']);

export function isServerKeyOwnerRole(role) {
  return OWNER_ROLES.has(String(role || '').trim().toLowerCase());
}

async function roleOf(db, userId) {
  const pool = db || (await import('../db.js')).default;
  const { rows } = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0]?.role || null;
}

/**
 * Whether this caller may spend the server's own keys. `userRole` is the
 * session's role when known; otherwise the role is read for `userId`.
 * A lookup failure never opens the owner's keys to anyone.
 */
export async function mayUseServerKeys({ userId = null, userRole = null } = {}, {
  mode = getRuntimeMode(),
  db = null,
} = {}) {
  if (mode === RUNTIME_MODES.PRIVATE_SERVER) return true;
  // Work this computer runs for itself (no person behind it) is the owner's.
  if (!userId && !userRole) return mode === RUNTIME_MODES.LOCAL_DESKTOP;
  let role = userRole;
  if (!role) {
    try {
      role = await roleOf(db, userId);
    } catch {
      return false;
    }
  }
  if (isServerKeyOwnerRole(role)) return true;
  // The owner turned sharing on for this account.
  return mode === RUNTIME_MODES.LOCAL_DESKTOP && Boolean(userId) && isKeySharedWith(userId);
}

// Every provider whose chat config can carry a key from the server's .env.
const CHAT_PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'xai', 'moonshot', 'zai', 'opencode', 'cohere'];
const NOT_A_KEY = new Set(['', 'ollama']);

/** Whether `apiKey` is one of the server's own keys (not someone's vault key). */
export function isServerKeyValue(apiKey, env = process.env) {
  const key = String(apiKey || '').trim();
  if (NOT_A_KEY.has(key)) return false;
  for (const names of Object.values(ENV_KEY_NAMES)) {
    if (names.some((name) => String(env[name] || '').trim() === key)) return true;
  }
  if (['AI_API_KEY', 'EMBEDDING_API_KEY'].some((name) => String(env[name] || '').trim() === key)) return true;
  try {
    if (resolveChatModelConfig().apiKey === key) return true;
    return CHAT_PROVIDERS.some((provider) => resolveChatModelConfig({ modelProvider: provider }).apiKey === key);
  } catch {
    return false;
  }
}

/**
 * The model config a person's chat, agent or workflow may run on, on a local
 * install. A config carrying the server's own key goes to a teammate only
 * when they are the owner or the owner shares keys with them; otherwise their
 * own vault key is swapped in, or they get the plain "add your key" message.
 * Models running on this computer (Ollama) need no key and always pass.
 * Cloud and private-server installs keep their own rules (byokPolicy.js).
 */
export async function scopeServerKey(config, { userId = null, userRole = null } = {}, {
  mode = getRuntimeMode(),
  db = null,
  lookupKey = null,
  mayUse = mayUseServerKeys,
} = {}) {
  if (mode !== RUNTIME_MODES.LOCAL_DESKTOP || !config) return config;
  if (isLocalBaseUrl(config.baseUrl) || !isServerKeyValue(config.apiKey)) return config;
  if (!userId && !userRole) return config;
  if (await mayUse({ userId, userRole }, { mode, db })) return config;
  logServerKeyHeldBack(config.provider, userId);
  // Loaded here, not at the top: most callers never get this far.
  const userKeys = await import('./userApiKeys.js');
  const keyProvider = userKeys.inferUserApiKeyProvider(config.provider, config.baseUrl);
  let personal = null;
  if (userId && keyProvider) {
    try {
      personal = await (lookupKey || userKeys.getUserApiKeyConfig)(userId, keyProvider);
    } catch {
      personal = null;
    }
  }
  if (personal?.apiKey) return { ...config, apiKey: personal.apiKey };
  throw missingKeyError(keyProvider, { message: missingKeyMessage(keyProvider) });
}
