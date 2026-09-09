import {
  decryptCredential,
  encryptCredential,
} from '../server/security/credentialVault.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

describe('credential vault', () => {
  test('round trips credentials only with the same owner and provider context', () => {
    process.env.CENSAI_VAULT_SECRET = 'vault-test-secret-with-at-least-32-characters';
    const context = { ownerId: 7, provider: 'google' };
    const encrypted = encryptCredential('refresh-secret', context);

    expect(encrypted).not.toContain('refresh-secret');
    expect(decryptCredential(encrypted, context)).toBe('refresh-secret');
    expect(() => decryptCredential(encrypted, {
      ownerId: 8,
      provider: 'google',
    })).toThrow();
  });

  test('requires the vault secret in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CENSAI_VAULT_SECRET;

    expect(() => encryptCredential('secret', {
      ownerId: 7,
      provider: 'google',
    })).toThrow('Missing required secret: CENSAI_VAULT_SECRET');
  });
});
