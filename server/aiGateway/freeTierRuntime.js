import {
  getRuntimeMode,
  isFeatureEnabled,
  RUNTIME_MODES,
} from '../middleware/runtimeMode.js';
import { getSecret } from '../secrets.js';
import {
  loadFreeTierConfig,
  validateFreeTierFeatureFlag,
} from './freeTierConfig.js';

function enabledEnvironment(env) {
  return Object.assign(Object.create(env), {
    CENSAI_FEATURE_FREE_AI_TIER: 'true',
  });
}

export function resolveFreeTierRuntime({
  env = process.env,
  runtimeMode = getRuntimeMode(),
  requirePlatformKey = false,
} = {}) {
  validateFreeTierFeatureFlag(env);
  const enabled = runtimeMode === RUNTIME_MODES.CLOUD_SAAS
    && isFeatureEnabled('free-ai-tier', { env, mode: runtimeMode });
  if (!enabled) return Object.freeze({ enabled: false, runtimeMode });

  const platformKey = requirePlatformKey ? getSecret('OPENROUTER_API_KEY') : null;
  const config = loadFreeTierConfig({
    env: enabledEnvironment(env),
    runtimeMode: requirePlatformKey ? runtimeMode : RUNTIME_MODES.PRIVATE_SERVER,
    apiKey: requirePlatformKey ? (platformKey ?? '') : null,
  });
  return Object.freeze({ enabled: true, runtimeMode, config, platformKey });
}

export function getFreeTierReadiness() {
  try {
    const runtime = resolveFreeTierRuntime({ requirePlatformKey: true });
    return Object.freeze({
      ready: true,
      enabled: runtime.enabled,
      ...(runtime.enabled ? {
        provider: runtime.config.provider,
        model: runtime.config.model,
      } : {}),
    });
  } catch {
    return Object.freeze({
      ready: false,
      enabled: true,
      error: 'free_ai_configuration_invalid',
    });
  }
}
