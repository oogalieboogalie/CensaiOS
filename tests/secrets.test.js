import {
  getSecret,
  initSecrets,
  optionalSecret,
  requireProductionSecret,
  requireSecret,
} from '../server/secrets.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

describe('secret configuration', () => {
  test('requires explicitly requested secrets without exposing values', () => {
    delete process.env.TEST_REQUIRED_SECRET;

    expect(() => requireSecret('TEST_REQUIRED_SECRET'))
      .toThrow('Missing required secret: TEST_REQUIRED_SECRET');
  });

  test('returns optional fallbacks and preserves the legacy empty-string accessor', () => {
    delete process.env.TEST_OPTIONAL_SECRET;

    expect(optionalSecret('TEST_OPTIONAL_SECRET', 'fallback')).toBe('fallback');
    expect(getSecret('TEST_OPTIONAL_SECRET')).toBe('');
  });

  test('requires production secrets in production and cloud modes', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;

    expect(() => requireProductionSecret('SESSION_SECRET'))
      .toThrow('Missing required secret: SESSION_SECRET');

    process.env.NODE_ENV = 'test';
    process.env.HOMEBASE_MODE = 'cloud_saas';

    expect(() => requireProductionSecret('SESSION_SECRET'))
      .toThrow('Missing required secret: SESSION_SECRET');

    delete process.env.HOMEBASE_MODE;
    process.env.CENSAI_MODE = 'cloud_saas';

    expect(() => requireProductionSecret('SESSION_SECRET'))
      .toThrow('Missing required secret: SESSION_SECRET');
  });

  test('allows local desktop secrets to remain unset', () => {
    process.env.NODE_ENV = 'development';
    process.env.HOMEBASE_MODE = 'local_desktop';
    delete process.env.SESSION_SECRET;

    expect(requireProductionSecret('SESSION_SECRET')).toBeNull();
  });

  test('validates every production boot secret', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'session-test-value';
    delete process.env.JOURNAL_SECRET;

    await expect(initSecrets()).rejects.toThrow(
      'Missing required secret: JOURNAL_SECRET'
    );
  });
});
