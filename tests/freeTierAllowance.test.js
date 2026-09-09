import {
  FreeTierAllowanceError,
  getFreeTierAllowanceStatus,
  reserveFreeTierAllowance,
} from '../server/aiGateway/freeTierAllowance.js';
import { FreeTierLedgerDb } from './support/freeTierLedgerDb.js';

const CORRELATIONS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
];

function request(db, overrides = {}) {
  return {
    db,
    workspaceId: 'workspace-a',
    userId: 'user-a',
    correlationId: CORRELATIONS[0],
    source: 'chat',
    config: {
      provider: 'openrouter',
      model: 'openrouter/free',
      userDailyLimit: 8,
      sharedDailyLimit: 40,
      sharedMinuteLimit: 10,
    },
    ...overrides,
  };
}

describe('free AI allowance reservations', () => {
  test('performs no database work when the validated feature is off', async () => {
    const db = new FreeTierLedgerDb();
    await expect(reserveFreeTierAllowance(request(db, {
      config: { enabled: false },
    }))).resolves.toMatchObject({
      allowed: false,
      code: 'FREE_TIER_DISABLED',
    });
    await expect(getFreeTierAllowanceStatus(request(db, {
      config: { enabled: false },
    }))).resolves.toEqual({ enabled: false });
    expect(db.queries).toHaveLength(0);
  });

  test('serializes concurrent limit-one reservations with stable advisory locks', async () => {
    const db = new FreeTierLedgerDb();
    const config = {
      userDailyLimit: 1,
      sharedDailyLimit: 1,
      sharedMinuteLimit: 1,
    };

    const [first, second] = await Promise.all([
      reserveFreeTierAllowance(request(db, { config, correlationId: CORRELATIONS[0] })),
      reserveFreeTierAllowance(request(db, { config, correlationId: CORRELATIONS[1] })),
    ]);

    expect([first, second].filter((result) => result.dispatchAllowed)).toHaveLength(1);
    expect([first, second].filter((result) => !result.allowed)).toHaveLength(1);
    expect(db.events.filter((event) => event.event_type === 'ai.free_tier.reserved')).toHaveLength(1);
    expect(db.lockKeys.slice(0, 4)).toEqual([...db.lockKeys.slice(0, 4)].sort());
    expect(db.queries.some(({ sql }) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
  });

  test('makes a correlation idempotent and rejects cross-context reuse', async () => {
    const db = new FreeTierLedgerDb();
    const first = await reserveFreeTierAllowance(request(db));
    const repeated = await reserveFreeTierAllowance(request(db));

    expect(first).toMatchObject({ allowed: true, dispatchAllowed: true, created: true });
    expect(repeated).toMatchObject({
      allowed: true,
      dispatchAllowed: false,
      created: false,
      idempotent: true,
      code: 'FREE_TIER_RESERVATION_EXISTS',
    });
    expect(db.events).toHaveLength(1);

    await expect(reserveFreeTierAllowance(request(db, {
      workspaceId: 'workspace-b',
    }))).rejects.toMatchObject({
      name: 'FreeTierAllowanceError',
      code: 'FREE_TIER_CORRELATION_CONFLICT',
    });
  });

  test('shares a user limit across workspaces and enforces the shared cap across users', async () => {
    const db = new FreeTierLedgerDb();
    const config = {
      userDailyLimit: 1,
      sharedDailyLimit: 2,
      sharedMinuteLimit: 10,
    };

    expect((await reserveFreeTierAllowance(request(db, { config }))).allowed).toBe(true);
    const sameUser = await reserveFreeTierAllowance(request(db, {
      config,
      workspaceId: 'workspace-b',
      correlationId: CORRELATIONS[1],
    }));
    expect(sameUser.code).toBe('FREE_TIER_USER_DAILY_LIMIT');

    expect((await reserveFreeTierAllowance(request(db, {
      config,
      userId: 'user-b',
      correlationId: CORRELATIONS[2],
    }))).allowed).toBe(true);
    const shared = await reserveFreeTierAllowance(request(db, {
      config,
      userId: 'user-c',
      correlationId: CORRELATIONS[3],
    }));
    expect(shared.code).toBe('FREE_TIER_SHARED_DAILY_LIMIT');
  });

  test('uses UTC calendar days and a rolling minute instead of a refreshed TTL', async () => {
    const db = new FreeTierLedgerDb();
    const config = {
      userDailyLimit: 1,
      sharedDailyLimit: 10,
      sharedMinuteLimit: 2,
    };
    const first = await reserveFreeTierAllowance(request(db, {
      config,
      now: '2026-07-13T23:59:30.000Z',
    }));
    const nextDay = await reserveFreeTierAllowance(request(db, {
      config,
      correlationId: CORRELATIONS[1],
      now: '2026-07-14T00:00:01.000Z',
    }));
    const minuteDenied = await reserveFreeTierAllowance(request(db, {
      config,
      userId: 'user-b',
      correlationId: CORRELATIONS[2],
      now: '2026-07-14T00:00:02.000Z',
    }));
    const minuteReset = await reserveFreeTierAllowance(request(db, {
      config,
      userId: 'user-b',
      correlationId: CORRELATIONS[3],
      now: '2026-07-14T00:00:30.001Z',
    }));

    expect(first.status.user.resetsAt).toBe('2026-07-14T00:00:00.000Z');
    expect(nextDay.allowed).toBe(true);
    expect(minuteDenied.code).toBe('FREE_TIER_SHARED_MINUTE_LIMIT');
    expect(minuteReset.allowed).toBe(true);
  });

  test('returns exact status fields without exposing another user event payload', async () => {
    const db = new FreeTierLedgerDb();
    await reserveFreeTierAllowance(request(db, {
      prompt: 'do not persist this prompt',
      messages: [{ content: 'secret message' }],
      tools: [{ secret: 'tool-secret' }],
      apiKey: 'provider-secret',
      response: { raw: 'raw-response' },
    }));
    const status = await getFreeTierAllowanceStatus(request(db));
    const serializedEvents = JSON.stringify(db.events);

    expect(status.user).toEqual({
      limit: 8,
      used: 0,
      reserved: 1,
      remaining: 7,
      resetsAt: '2026-07-14T00:00:00.000Z',
    });
    expect(serializedEvents).not.toMatch(/prompt|secret message|tool-secret|provider-secret|raw-response/);
    expect(db.events[0].payload).toEqual(expect.objectContaining({
      source: 'chat',
      provider: 'openrouter',
      model: 'openrouter/free',
    }));
  });

  test('rejects invalid identity before opening a database transaction', async () => {
    const db = new FreeTierLedgerDb();
    await expect(reserveFreeTierAllowance(request(db, { correlationId: 'caller-value' })))
      .rejects.toBeInstanceOf(FreeTierAllowanceError);
    expect(db.queries).toHaveLength(0);
  });
});
