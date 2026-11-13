import { jest } from '@jest/globals';
import pool from '../server/db.js';
import { callerMaySeeHealthDetail } from '../server/health/probes.js';

// The real check, not a stand-in passed into the route. The role lookup is
// the database; hub and guest sessions must be refused before that lookup.

describe('callerMaySeeHealthDetail', () => {
  let query;

  beforeEach(() => {
    query = jest.spyOn(pool, 'query').mockImplementation(async (sql, params) => {
      if (String(sql).includes('role FROM users') && Number(params?.[0]) === 7) {
        return { rows: [{ role: 'admin' }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    query.mockRestore();
  });

  test('refuses a hub session and a guest session, and accepts a real admin', async () => {
    await expect(callerMaySeeHealthDetail({
      session: { userId: 1, hubAccount: { id: 1 } },
    })).resolves.toBe(false);
    await expect(callerMaySeeHealthDetail({
      session: { userId: 1, guest: { guestId: 'guest-1', name: 'Ada' } },
    })).resolves.toBe(false);
    await expect(callerMaySeeHealthDetail({
      session: { userId: '11111111-1111-4111-8111-111111111111' },
    })).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();

    await expect(callerMaySeeHealthDetail({
      session: { userId: 7 },
    })).resolves.toBe(true);
    expect(query).toHaveBeenCalled();
    const roleCalls = query.mock.calls.filter(([sql]) => String(sql).includes('role FROM users'));
    expect(roleCalls).toHaveLength(1);
    expect(roleCalls[0][1]).toEqual([7]);
  });
});