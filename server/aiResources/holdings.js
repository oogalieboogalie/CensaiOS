// The keys one person holds: the ones they saved in the key vault (Settings,
// Bring Your Own Key) and, for the owner of a local install, the ones in the
// server's .env file. Each comes back as provider + fingerprint + last four
// characters; the key itself is read only to make that and then dropped.

import pool from '../db.js';
import { decryptKey } from '../security/vault.js';
import { USER_API_KEY_PROVIDERS } from '../security/userApiKeys.js';
import { envKeyFor, ownerEnvKeyProviders } from '../security/envKeys.js';
import { keyIdentity } from './keyIdentity.js';

// Keys that pay for AI. GitHub, Figma, eBay, YouTube and Google Cloud keys live
// in the same vault but are not AI spending, so the window leaves them out.
const NOT_AI = new Set(['github', 'figma', 'ebay', 'googlecloud', 'youtube']);
const AI_PROVIDERS = USER_API_KEY_PROVIDERS.filter((p) => !NOT_AI.has(p));

export async function heldKeys(userId, { db = pool, env = process.env } = {}) {
  const held = [];
  const { rows } = await db.query(
    `SELECT provider, api_key_encrypted, model_name, updated_at
       FROM user_api_keys WHERE user_id = $1 AND provider = ANY($2)`,
    [userId, AI_PROVIDERS],
  );
  for (const row of rows) {
    let identity = null;
    try { identity = keyIdentity(row.provider, decryptKey(row.api_key_encrypted, userId)); } catch { /* unreadable: listed without a fingerprint */ }
    held.push({
      provider: row.provider,
      source: 'vault',
      keyId: identity?.id || null,
      last4: identity?.last4 || '',
      modelName: row.model_name || null,
      savedAt: row.updated_at || null,
    });
  }
  const saved = new Set(held.map((k) => k.provider));
  for (const provider of await ownerEnvKeyProviders(db, userId, { env })) {
    if (saved.has(provider) || NOT_AI.has(provider)) continue;
    const identity = keyIdentity(provider, envKeyFor(provider, env));
    if (identity) held.push({ provider, source: 'env', keyId: identity.id, last4: identity.last4, modelName: null, savedAt: null });
  }
  return held;
}

/** The held key with this id, or null (so nobody sets a budget on someone else's key). */
export async function heldKey(userId, keyId, options) {
  if (!keyId) return null;
  return (await heldKeys(userId, options)).find((k) => k.keyId === keyId) || null;
}
