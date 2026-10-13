import { jest } from '@jest/globals';

// The provider a saved key belongs to is read from the base URL's real
// hostname, so a provider name hidden in a path or query string is ignored.

jest.unstable_mockModule('../server/db.js', () => ({ default: { query: jest.fn() } }));

const { inferUserApiKeyProvider } = await import('../server/security/userApiKeys.js');

describe('inferUserApiKeyProvider', () => {
  test('recognizes each provider by its hostname', () => {
    expect(inferUserApiKeyProvider(null, 'https://api.openai.com/v1')).toBe('openai');
    expect(inferUserApiKeyProvider(null, 'https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferUserApiKeyProvider(null, 'https://generativelanguage.googleapis.com')).toBe('google');
    expect(inferUserApiKeyProvider(null, 'google-native')).toBe('google');
    expect(inferUserApiKeyProvider(null, 'api.anthropic.com')).toBe('anthropic');
    expect(inferUserApiKeyProvider(null, 'https://api.z.ai/api/paas/v4')).toBe('zai');
    expect(inferUserApiKeyProvider(null, 'https://api.x.ai/v1')).toBe('xai');
  });

  test('ignores a provider name outside the hostname', () => {
    expect(inferUserApiKeyProvider(null, 'https://evil.example/?u=api.openai.com')).toBeNull();
    expect(inferUserApiKeyProvider(null, 'https://api.openai.com.evil.example/v1')).toBeNull();
    expect(inferUserApiKeyProvider(null, 'https://notcohere.ai')).toBeNull();
    expect(inferUserApiKeyProvider(null, '')).toBeNull();
  });
});
