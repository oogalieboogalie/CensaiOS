// The Idea Pad's Expand used to call Gemini only, so someone whose only key
// is Claude or OpenAI got a "needs a Google key" error. Pick a model the
// person actually has a key for: Gemini Flash when there is a Google key (or
// no key at all, so the missing-key message stays the same), otherwise the
// first saved provider in the chat fallback order.

import pool from '../../db.js';
import { dbReady } from '../../dbState.js';
import { ownerEnvKeyProviders } from '../../security/envKeys.js';
import { MODEL_OPTIONS } from '../../../src/lib/agentModelOptions.js';
import { pickFallbackProvider } from './keyFallback.js';

const DEFAULT = Object.freeze({ provider: 'google', model: 'gemini-2.5-flash' });

export function chooseIdeaModel(savedProviders, { override = process.env.IDEA_EXPAND_MODEL } = {}) {
  // An explicit IDEA_EXPAND_MODEL is a Gemini model name (the old setting).
  if (override) return { provider: 'google', model: override };
  const saved = new Set(savedProviders || []);
  if (saved.size === 0 || saved.has('google')) return DEFAULT;
  const provider = pickFallbackProvider([...saved]);
  const model = provider && MODEL_OPTIONS[provider]?.[0]?.value;
  return provider && model ? { provider, model } : DEFAULT;
}

export async function ideaExpandModel(userId) {
  if (process.env.IDEA_EXPAND_MODEL || !userId || !dbReady()) return chooseIdeaModel([]);
  try {
    const { rows } = await pool.query('SELECT provider FROM user_api_keys WHERE user_id = $1', [userId]);
    const envProviders = await ownerEnvKeyProviders(pool, userId);
    return chooseIdeaModel([...rows.map(row => row.provider), ...envProviders]);
  } catch {
    return DEFAULT; // best-effort: the model call then explains what is missing
  }
}
