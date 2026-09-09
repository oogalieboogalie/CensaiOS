import {
  FREE_TIER_DEFAULTS,
  FreeTierConfigError,
  loadFreeTierConfig,
} from '../server/aiGateway/freeTierConfig.js';

describe('free AI tier configuration', () => {
  test('is dark by default and does not inspect secrets while disabled', () => {
    let secretReads = 0;
    const env = { CENSAI_FEATURE_FREE_AI_TIER: 'false' };
    Object.defineProperty(env, 'OPENROUTER_API_KEY', {
      get() {
        secretReads += 1;
        throw new Error('disabled config touched a secret');
      },
    });

    expect(loadFreeTierConfig({ env, runtimeMode: 'cloud_saas' })).toEqual(FREE_TIER_DEFAULTS);
    expect(secretReads).toBe(0);
  });

  test('loads the conservative platform defaults when explicitly enabled', () => {
    expect(loadFreeTierConfig({
      env: { CENSAI_FEATURE_FREE_AI_TIER: 'true' },
      runtimeMode: 'private_server',
    })).toEqual({
      enabled: true,
      provider: 'openrouter',
      model: 'openrouter/free',
      userDailyLimit: 8,
      sharedDailyLimit: 40,
      sharedMinuteLimit: 10,
      retries: 0,
    });
  });

  test('fails closed in cloud mode without the platform key', () => {
    expect(() => loadFreeTierConfig({
      env: { CENSAI_FEATURE_FREE_AI_TIER: 'true' },
      runtimeMode: 'cloud_saas',
    })).toThrow(expect.objectContaining({
      name: 'FreeTierConfigError',
      code: 'FREE_TIER_CONFIG_INVALID',
      field: 'apiKey',
    }));
  });

  test('accepts positive operator limits without returning the key', () => {
    const config = loadFreeTierConfig({
      env: {
        CENSAI_FEATURE_FREE_AI_TIER: 'true',
        CENSAI_FREE_AI_USER_DAILY_LIMIT: '2',
        CENSAI_FREE_AI_SHARED_DAILY_LIMIT: '11',
        CENSAI_FREE_AI_SHARED_MINUTE_LIMIT: '3',
      },
      runtimeMode: 'cloud_saas',
      apiKey: 'private-platform-key',
    });

    expect(config).toMatchObject({
      userDailyLimit: 2,
      sharedDailyLimit: 11,
      sharedMinuteLimit: 3,
    });
    expect(JSON.stringify(config)).not.toContain('private-platform-key');
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('allows an operator-selected free model only when it exactly matches the allowlist', () => {
    const model = 'meta-llama/llama-3.3-70b-instruct:free';
    expect(loadFreeTierConfig({
      env: {
        CENSAI_FEATURE_FREE_AI_TIER: 'true',
        CENSAI_FREE_AI_MODEL: model,
        CENSAI_FREE_AI_ALLOWED_MODEL: model,
      },
      runtimeMode: 'private_server',
    }).model).toBe(model);

    expect(() => loadFreeTierConfig({
      env: {
        CENSAI_FEATURE_FREE_AI_TIER: 'true',
        CENSAI_FREE_AI_MODEL: model,
      },
      runtimeMode: 'private_server',
    })).toThrow(expect.objectContaining({ field: 'model' }));
  });

  test.each([
    ['CENSAI_FREE_AI_USER_DAILY_LIMIT', '0', 'userDailyLimit'],
    ['CENSAI_FREE_AI_SHARED_DAILY_LIMIT', '-1', 'sharedDailyLimit'],
    ['CENSAI_FREE_AI_SHARED_MINUTE_LIMIT', '1.5', 'sharedMinuteLimit'],
    ['CENSAI_FREE_AI_PROVIDER', 'openai', 'provider'],
    ['CENSAI_FREE_AI_MODEL', 'openrouter/auto', 'model'],
    ['CENSAI_FREE_AI_RETRIES', '1', 'retries'],
  ])('rejects unsafe %s configuration', (name, value, field) => {
    expect(() => loadFreeTierConfig({
      env: {
        CENSAI_FEATURE_FREE_AI_TIER: 'true',
        OPENROUTER_API_KEY: 'configured',
        [name]: value,
      },
      runtimeMode: 'cloud_saas',
    })).toThrow(expect.objectContaining({ field }));
  });

  test('rejects an ambiguous feature flag', () => {
    expect(() => loadFreeTierConfig({
      env: { CENSAI_FEATURE_FREE_AI_TIER: 'sometimes' },
    })).toThrow(FreeTierConfigError);
  });
});
