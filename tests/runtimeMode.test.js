import { jest } from '@jest/globals';
import {
  getRuntimeMode,
  isCloudRuntime,
  isFeatureEnabled,
  requireFeatureFlag,
  requireLocalFilesystem,
  RUNTIME_MODES,
} from '../server/middleware/runtimeMode.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
  jest.clearAllMocks();
});

function response() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe('runtime mode middleware', () => {
  test('resolves explicit, local, and production runtime modes', () => {
    process.env.CENSAI_MODE = RUNTIME_MODES.LOCAL_DESKTOP;
    process.env.HOMEBASE_MODE = RUNTIME_MODES.PRIVATE_SERVER;
    expect(getRuntimeMode()).toBe(RUNTIME_MODES.LOCAL_DESKTOP);

    delete process.env.CENSAI_MODE;
    expect(getRuntimeMode()).toBe(RUNTIME_MODES.PRIVATE_SERVER);
    delete process.env.HOMEBASE_MODE;
    process.env.NODE_ENV = 'production';
    expect(getRuntimeMode()).toBe(RUNTIME_MODES.CLOUD_SAAS);
    expect(isCloudRuntime()).toBe(true);

    process.env.NODE_ENV = 'test';
    expect(getRuntimeMode()).toBe(RUNTIME_MODES.LOCAL_DESKTOP);
  });

  test('blocks local filesystem access in cloud mode', () => {
    process.env.HOMEBASE_MODE = RUNTIME_MODES.CLOUD_SAAS;
    const res = response();
    const next = jest.fn();

    requireLocalFilesystem({}, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Local filesystem access is disabled in cloud_saas mode',
      mode: RUNTIME_MODES.CLOUD_SAAS,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('requires explicit local-file opt-in on private server mode', () => {
    process.env.HOMEBASE_MODE = RUNTIME_MODES.PRIVATE_SERVER;
    const blocked = response();
    const blockedNext = jest.fn();

    requireLocalFilesystem({}, blocked, blockedNext);

    expect(blocked.status).toHaveBeenCalledWith(403);
    expect(blockedNext).not.toHaveBeenCalled();

    process.env.HOMEBASE_ALLOW_LOCAL_FILES = 'true';
    const allowed = response();
    const allowedNext = jest.fn();

    requireLocalFilesystem({}, allowed, allowedNext);

    expect(allowed.status).not.toHaveBeenCalled();
    expect(allowedNext).toHaveBeenCalled();
  });

  test('reads feature flags from direct and list environment settings', () => {
    process.env.CENSAI_FEATURE_MARKETPLACE = 'true';
    expect(isFeatureEnabled('marketplace')).toBe(true);

    process.env.CENSAI_FEATURE_MARKETPLACE = 'false';
    process.env.CENSAI_FEATURES = 'credits, package-registry';
    expect(isFeatureEnabled('marketplace')).toBe(false);
    expect(isFeatureEnabled('package_registry')).toBe(true);

    process.env.CENSAI_FEATURES_CLOUD_SAAS = 'billing';
    expect(isFeatureEnabled('billing', { mode: RUNTIME_MODES.CLOUD_SAAS })).toBe(true);
  });

  test('requireFeatureFlag blocks disabled features and passes enabled features', () => {
    const blocked = response();
    const blockedNext = jest.fn();

    requireFeatureFlag('billing')({}, blocked, blockedNext);

    expect(blocked.status).toHaveBeenCalledWith(404);
    expect(blocked.json).toHaveBeenCalledWith(expect.objectContaining({
      feature: 'billing',
    }));
    expect(blockedNext).not.toHaveBeenCalled();

    process.env.CENSAI_FEATURE_BILLING = 'enabled';
    const allowed = response();
    const allowedNext = jest.fn();

    requireFeatureFlag('billing')({}, allowed, allowedNext);

    expect(allowed.status).not.toHaveBeenCalled();
    expect(allowedNext).toHaveBeenCalled();
  });
});
