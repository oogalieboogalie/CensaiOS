// Which model a scout runs on. A person can pick one per agent; otherwise the
// scout takes the cheapest fast model the person has a key for (their own
// keys only). With no key at all the scout still maps and points, from the
// map alone, and says so.

import pool from '../db.js';
import { MODEL_OPTIONS } from '../../src/lib/agentModelOptions.js';

// Cheapest fast first. The scout's job is small, so it never needs a big model.
export const SCOUT_MODEL_LADDER = Object.freeze([
  { provider: 'google', model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { provider: 'anthropic', model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { provider: 'openai', model: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { provider: 'xai', model: 'grok-code-fast-1', label: 'Grok Code Fast' },
  { provider: 'zai', model: 'glm-5.3-flash', label: 'GLM 5.3 Flash' },
  { provider: 'openrouter', model: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (OpenRouter)' },
  { provider: 'opencode', model: 'nemotron-3.5-lightning-free', label: 'Nemotron 3.5 Lightning (free)' },
  { provider: 'cohere', model: 'command-r7b-12-2024', label: 'Command R7B' },
]);

const LOCAL_PROVIDER = 'ollama';
const AGENT_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function scoutModelLabel(provider, model) {
  const rung = SCOUT_MODEL_LADDER.find((r) => r.provider === provider && r.model === model);
  if (rung) return rung.label;
  if (provider === LOCAL_PROVIDER) return `${model} (on this computer)`;
  return model;
}

/** Every model a scout may use, marked with whether this person has its key. */
export function scoutModelChoices(keyProviders = []) {
  const keys = new Set(keyProviders);
  const choices = [];
  for (const [provider, models] of Object.entries(MODEL_OPTIONS)) {
    for (const { value } of models) {
      choices.push({
        provider, model: value, label: scoutModelLabel(provider, value),
        hasKey: provider === LOCAL_PROVIDER || keys.has(provider),
      });
    }
  }
  return choices;
}

export function pickAutoModel(keyProviders = []) {
  const keys = new Set(keyProviders);
  return SCOUT_MODEL_LADDER.find((rung) => keys.has(rung.provider)) || null;
}

export async function keyProvidersFor(userId, db = pool) {
  if (!userId) return [];
  const { rows } = await db.query('SELECT provider FROM user_api_keys WHERE user_id = $1', [userId]);
  return rows.map((row) => row.provider);
}

export async function getScoutSetting(db, { userId, agentId }) {
  if (!userId || !AGENT_ID.test(String(agentId || ''))) return null;
  const { rows } = await db.query(
    'SELECT model_provider, model_name, updated_at FROM agent_scout_settings WHERE user_id = $1 AND agent_id = $2',
    [userId, agentId],
  );
  return rows[0] || null;
}

export async function saveScoutSetting(db, { userId, agentId, provider, model }) {
  if (!AGENT_ID.test(String(agentId || ''))) throw Object.assign(new Error('Pick an agent first.'), { statusCode: 400 });
  const auto = !provider || !model;
  if (!auto && !scoutModelChoices().some((c) => c.provider === provider && c.model === model)) {
    throw Object.assign(new Error('That model is not on the list.'), { statusCode: 400 });
  }
  await db.query(
    `INSERT INTO agent_scout_settings (user_id, agent_id, model_provider, model_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, agent_id) DO UPDATE SET
       model_provider = EXCLUDED.model_provider, model_name = EXCLUDED.model_name, updated_at = NOW()`,
    [userId, agentId, auto ? null : provider, auto ? null : model],
  );
}

/**
 * The model this agent's scout uses for this person right now:
 * { provider, model, label, auto, reason } or { provider: null, reason }.
 */
export async function resolveScoutModel({ userId, agentId }, { db = pool } = {}) {
  const [setting, keys] = await Promise.all([
    getScoutSetting(db, { userId, agentId }).catch(() => null),
    keyProvidersFor(userId, db).catch(() => []),
  ]);
  if (setting?.model_provider && setting?.model_name) {
    const { model_provider: provider, model_name: model } = setting;
    const usable = provider === LOCAL_PROVIDER || keys.includes(provider);
    if (usable) return { provider, model, label: scoutModelLabel(provider, model), auto: false };
    const fallback = pickAutoModel(keys);
    return fallback
      ? { ...fallback, auto: true, reason: `No ${provider} key saved, so the scout used ${fallback.label}.` }
      : { provider: null, model: null, auto: true, reason: `No ${provider} key saved yet.` };
  }
  const auto = pickAutoModel(keys);
  return auto
    ? { ...auto, auto: true }
    : { provider: null, model: null, auto: true, reason: 'No model key saved yet, so the scout pointed from its map alone.' };
}
