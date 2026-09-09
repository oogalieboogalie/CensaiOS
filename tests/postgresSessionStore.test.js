import { jest } from '@jest/globals';
import { PostgresSessionStore } from '../server/security/postgresSessionStore.js';

function createStore(query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 })) {
  const store = new PostgresSessionStore({ query }, {
    cleanupIntervalMs: 60_000,
    onCleanupError: jest.fn(),
  });
  return { store, query };
}

describe('Postgres session store', () => {
  test('can disable automatic maintenance for isolated runtimes', () => {
    const query = jest.fn();
    const store = new PostgresSessionStore({ query }, {
      cleanupIntervalMs: 0,
      cleanupOnStart: false,
    });

    expect(store.cleanupTimer).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(() => {
      store.close();
      store.close();
    }).not.toThrow();
  });

  test('never returns an expired session', async () => {
    const { store, query } = createStore();
    query.mockClear();
    query.mockResolvedValueOnce({ rows: [{ sess: { userId: 7 } }] });

    const value = await new Promise((resolve, reject) => {
      store.get('sid-1', (error, session) => error ? reject(error) : resolve(session));
    });

    expect(value).toEqual({ userId: 7 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('expire > NOW()'),
      ['sid-1']
    );
    store.close();
  });

  test('uses the cookie expiry when persisting and touching a session', async () => {
    const { store, query } = createStore();
    query.mockClear();
    const expires = new Date('2026-08-01T00:00:00.000Z');
    const value = { cookie: { expires }, userId: 7 };

    await new Promise((resolve, reject) => {
      store.set('sid-2', value, (error) => error ? reject(error) : resolve());
    });
    await new Promise((resolve, reject) => {
      store.touch('sid-2', value, (error) => error ? reject(error) : resolve());
    });

    expect(query.mock.calls[0][1][2]).toEqual(expires);
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('expire > NOW()'),
      ['sid-2', expires],
    ]);
    store.close();
  });

  test('cleans expired rows without touching active sessions', async () => {
    const { store, query } = createStore();
    query.mockClear();
    query.mockResolvedValueOnce({ rowCount: 3, rows: [] });

    await expect(store.cleanupExpired()).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith('DELETE FROM session WHERE expire <= NOW()');
    store.close();
  });
});
