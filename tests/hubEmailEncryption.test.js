import { encryptEmail, decryptEmail } from '../server/hubAccounts/encryption.js';

// A stand-in secret for this file only. Never a real vault secret.
const TEST_SECRET = 'hub-email-test-secret-not-used-outside-tests';

describe('hub email encryption', () => {
  const previous = process.env.CENSAI_VAULT_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.CENSAI_VAULT_SECRET;
    else process.env.CENSAI_VAULT_SECRET = previous;
  });

  test('fails closed when the vault secret is unset', () => {
    delete process.env.CENSAI_VAULT_SECRET;
    expect(() => encryptEmail('ada@example.com')).toThrow('Missing required secret: CENSAI_VAULT_SECRET');
  });

  test('fails closed when the vault secret is blank', () => {
    process.env.CENSAI_VAULT_SECRET = '   ';
    expect(() => encryptEmail('ada@example.com')).toThrow('Missing required secret: CENSAI_VAULT_SECRET');
  });

  test('round-trips an email when a test secret is set', () => {
    process.env.CENSAI_VAULT_SECRET = TEST_SECRET;
    const stored = encryptEmail('Ada@Example.com');
    expect(stored).toEqual(expect.any(String));
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored.toLowerCase()).not.toContain('ada@example.com');
    expect(decryptEmail(stored)).toBe('ada@example.com');
  });
});
