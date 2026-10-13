import { jest } from '@jest/globals';
import {
  getOAuthCredential,
  migrateLegacyOAuthCredentials,
  saveOAuthCredential,
} from '../server/credentials/oauthStore.js';

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

function createDb(rows = []) {
  return {
    query: jest.fn()
      .mockResolvedValueOnce({ rows })
      .mockResolvedValue({ rows: [] }),
  };
}

describe('OAuth credential store', () => {
  beforeEach(() => {
    process.env.CENSAI_VAULT_SECRET = 'vault-test-secret-with-at-least-32-characters';
  });

  test('persists encrypted values and clears raw token columns', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await saveOAuthCredential({
      db,
      userId: 7,
      provider: 'google',
      tokens: {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        expiry_date: 123,
        scope: 'calendar',
      },
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('access_token = NULL');
    expect(sql).toContain('refresh_token = NULL');
    expect(values[2]).not.toContain('access-secret');
    expect(values[3]).not.toContain('refresh-secret');
  });

  test('encrypts even when the production vault secret is missing (dev-key fallback)', async () => {
    // The vault falls back to a deterministic local-dev key when
    // CENSAI_VAULT_SECRET is unset. Encryption must still happen so raw
    // tokens never land in the encrypted columns.
    delete process.env.CENSAI_VAULT_SECRET;
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await saveOAuthCredential({
      db,
      userId: 7,
      provider: 'google',
      tokens: {
        access_token: 'dummy-access-fallback',
        refresh_token: 'dummy-refresh-fallback',
      },
    });

    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('access_token = NULL');
    expect(sql).toContain('refresh_token = NULL');
    expect(values[2]).not.toBe('dummy-access-fallback');
    expect(values[3]).not.toBe('dummy-refresh-fallback');
    expect(String(values[2])).not.toContain('dummy-access-fallback');
    expect(String(values[3])).not.toContain('dummy-refresh-fallback');
  });

  test('never includes raw tokens anywhere in the SQL parameter list', async () => {
    // The defensive guarantee: scan every value passed to db.query and
    // make sure neither the raw access_token nor the raw refresh_token
    // appears in any position (including scope, expiry_date, etc).
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await saveOAuthCredential({
      db,
      userId: 7,
      provider: 'google',
      tokens: {
        access_token: 'dummy-private-access-do-not-leak',
        refresh_token: 'dummy-private-refresh-do-not-leak',
        expiry_date: 9999,
        scope: 'calendar.readonly',
      },
    });

    const [sql, values] = db.query.mock.calls[0];
    for (const value of values) {
      const asString = value === null || value === undefined ? '' : String(value);
      expect(asString).not.toContain('dummy-private-access-do-not-leak');
      expect(asString).not.toContain('dummy-private-refresh-do-not-leak');
    }
    // And the SQL itself must not contain the raw token strings either.
    expect(sql).not.toContain('dummy-private-access-do-not-leak');
    expect(sql).not.toContain('dummy-private-refresh-do-not-leak');
  });

  test('decrypts encrypted credentials for provider clients', async () => {
    const writer = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await saveOAuthCredential({
      db: writer,
      userId: 7,
      provider: 'google',
      tokens: { access_token: 'access', refresh_token: 'refresh' },
    });
    const values = writer.query.mock.calls[0][1];
    const db = createDb([{
      user_id: 7,
      provider: 'google',
      encrypted_access_token: values[2],
      encrypted_refresh_token: values[3],
      access_token: null,
      refresh_token: null,
      expiry_date: null,
      scope: null,
    }]);

    await expect(getOAuthCredential({
      db,
      userId: 7,
      provider: 'google',
    })).resolves.toEqual(expect.objectContaining({
      access_token: 'access',
      refresh_token: 'refresh',
    }));
  });

  test('migrates legacy raw rows through the encrypted save path', async () => {
    const db = createDb([{
      user_id: 7,
      provider: 'google',
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      access_token: 'legacy-access',
      refresh_token: 'legacy-refresh',
      expiry_date: null,
      scope: null,
    }]);

    await expect(migrateLegacyOAuthCredentials(db)).resolves.toBe(1);
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('refresh_token = NULL');
  });
});
