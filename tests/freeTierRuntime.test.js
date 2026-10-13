import { jest } from '@jest/globals';

const getRuntimeMode = jest.fn();
const isFeatureEnabled = jest.fn();
const getSecret = jest.fn();

jest.unstable_mockModule('../server/middleware/runtimeMode.js', () => ({
  getRuntimeMode,
  isFeatureEnabled,
  RUNTIME_MODES: {
    LOCAL_DESKTOP: 'local_desktop',
    PRIVATE_SERVER: 'private_server',
    CLOUD_SAAS: 'cloud_saas',
  },
}));
jest.unstable_mockModule('../server/secrets.js', () => ({ getSecret }));

const { getFreeTierReadiness, resolveFreeTierRuntime } = await import(
  '../server/aiGateway/freeTierRuntime.js'
);

const originalFlag = process.env.CENSAI_FEATURE_FREE_AI_TIER;

beforeEach(() => {
  jest.clearAllMocks();
  getRuntimeMode.mockReturnValue('cloud_saas');
  isFeatureEnabled.mockReturnValue(true);
  getSecret.mockReturnValue('platform-key');
  process.env.CENSAI_FEATURE_FREE_AI_TIER = 'true';
});

afterAll(() => {
  if (originalFlag === undefined) delete process.env.CENSAI_FEATURE_FREE_AI_TIER;
  else process.env.CENSAI_FEATURE_FREE_AI_TIER = originalFlag;
});

test('dark and non-cloud modes do not read the platform secret', () => {
  isFeatureEnabled.mockReturnValue(false);
  expect(resolveFreeTierRuntime({
    env: { CENSAI_FEATURE_FREE_AI_TIER: 'false' },
    runtimeMode: 'cloud_saas',
    requirePlatformKey: true,
  })).toMatchObject({ enabled: false });

  isFeatureEnabled.mockReturnValue(true);
  expect(resolveFreeTierRuntime({
    env: { CENSAI_FEATURE_FREE_AI_TIER: 'true' },
    runtimeMode: 'private_server',
    requirePlatformKey: true,
  })).toMatchObject({ enabled: false });
  expect(getSecret).not.toHaveBeenCalled();
});

test('ambiguous direct feature flags fail readiness instead of silently going dark', () => {
  process.env.CENSAI_FEATURE_FREE_AI_TIER = 'sometimes';
  expect(getFreeTierReadiness()).toEqual({
    ready: false,
    enabled: true,
    error: 'free_ai_configuration_invalid',
  });
  expect(getSecret).not.toHaveBeenCalled();
});

test('feature-on readiness fails closed when the platform key is missing', () => {
  getSecret.mockReturnValue(null);
  expect(getFreeTierReadiness()).toMatchObject({
    ready: false,
    enabled: true,
    error: 'free_ai_configuration_invalid',
  });
});

test('feature-on readiness exposes only safe route metadata', () => {
  const status = getFreeTierReadiness();
  expect(status).toEqual({
    ready: true,
    enabled: true,
    provider: 'openrouter',
    model: 'openrouter/free',
  });
  expect(JSON.stringify(status)).not.toContain('platform-key');
});
