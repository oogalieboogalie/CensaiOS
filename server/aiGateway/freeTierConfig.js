const DEFAULT_MODEL = 'openrouter/free';

export const FREE_TIER_DEFAULTS = Object.freeze({
  enabled: false,
  provider: 'openrouter',
  model: DEFAULT_MODEL,
  userDailyLimit: 8,
  sharedDailyLimit: 40,
  sharedMinuteLimit: 10,
  retries: 0,
});

export class FreeTierConfigError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'FreeTierConfigError';
    this.code = 'FREE_TIER_CONFIG_INVALID';
    this.field = field;
  }
}

function readBoolean(value, field) {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
  throw new FreeTierConfigError(`${field} must be a boolean`, field);
}

export function validateFreeTierFeatureFlag(env = process.env) {
  const value = env.CENSAI_FEATURE_FREE_AI_TIER;
  if (value === undefined || value === null || value === '') return null;
  return readBoolean(value, 'CENSAI_FEATURE_FREE_AI_TIER');
}

function readPositiveInteger(value, fallback, field) {
  const candidate = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new FreeTierConfigError(`${field} must be a positive integer`, field);
  }
  return candidate;
}

function readZeroRetries(value) {
  const candidate = value === undefined || value === '' ? 0 : Number(value);
  if (candidate !== 0) {
    throw new FreeTierConfigError('CENSAI_FREE_AI_RETRIES must be 0', 'retries');
  }
  return candidate;
}

function readString(value, fallback) {
  return String(value ?? fallback).trim().toLowerCase();
}

function isFreeModelSlug(model) {
  return model === DEFAULT_MODEL || model.endsWith(':free');
}

export function loadFreeTierConfig({
  env = process.env,
  runtimeMode = env.CENSAI_MODE || env.HOMEBASE_MODE,
  apiKey,
} = {}) {
  const enabled = validateFreeTierFeatureFlag(env) ?? false;

  // A dark feature must not require a key or activate policy validation.
  if (!enabled) return Object.freeze({ ...FREE_TIER_DEFAULTS });

  const provider = readString(env.CENSAI_FREE_AI_PROVIDER, FREE_TIER_DEFAULTS.provider);
  const model = readString(env.CENSAI_FREE_AI_MODEL, FREE_TIER_DEFAULTS.model);
  const allowlistedModel = readString(env.CENSAI_FREE_AI_ALLOWED_MODEL, DEFAULT_MODEL);
  if (provider !== 'openrouter') {
    throw new FreeTierConfigError('free AI provider must be openrouter', 'provider');
  }
  if (!isFreeModelSlug(allowlistedModel) || model !== allowlistedModel) {
    throw new FreeTierConfigError(
      'free AI model must match the configured free-model allowlist',
      'model',
    );
  }
  const configuredApiKey = apiKey ?? env.OPENROUTER_API_KEY;
  if (runtimeMode === 'cloud_saas' && !String(configuredApiKey || '').trim()) {
    throw new FreeTierConfigError('OPENROUTER_API_KEY is required in cloud_saas mode', 'apiKey');
  }

  return Object.freeze({
    enabled: true,
    provider,
    model,
    userDailyLimit: readPositiveInteger(
      env.CENSAI_FREE_AI_USER_DAILY_LIMIT,
      FREE_TIER_DEFAULTS.userDailyLimit,
      'userDailyLimit',
    ),
    sharedDailyLimit: readPositiveInteger(
      env.CENSAI_FREE_AI_SHARED_DAILY_LIMIT,
      FREE_TIER_DEFAULTS.sharedDailyLimit,
      'sharedDailyLimit',
    ),
    sharedMinuteLimit: readPositiveInteger(
      env.CENSAI_FREE_AI_SHARED_MINUTE_LIMIT,
      FREE_TIER_DEFAULTS.sharedMinuteLimit,
      'sharedMinuteLimit',
    ),
    retries: readZeroRetries(env.CENSAI_FREE_AI_RETRIES),
  });
}
