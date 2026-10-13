import {
  getFreeTierAllowanceStatus,
  reserveFreeTierAllowance,
} from '../server/aiGateway/freeTierAllowance.js';
import {
  consumeFreeTierAllowance,
  releaseFreeTierAllowance,
} from '../server/aiGateway/freeTierSettlement.js';
import { FreeTierLedgerDb } from './support/freeTierLedgerDb.js';

const FIRST = '10000000-0000-4000-8000-000000000001';
const SECOND = '10000000-0000-4000-8000-000000000002';
const THIRD = '10000000-0000-4000-8000-000000000003';

function context(db, overrides = {}) {
  return {
    db,
    workspaceId: 'workspace-a',
    userId: 'user-a',
    correlationId: FIRST,
    source: 'task-worker',
    config: {
      userDailyLimit: 1,
      sharedDailyLimit: 1,
      sharedMinuteLimit: 2,
    },
    ...overrides,
  };
}

describe('free AI allowance settlement', () => {
  test('consumes a reservation exactly once', async () => {
    const db = new FreeTierLedgerDb();
    await reserveFreeTierAllowance(context(db));

    const first = await consumeFreeTierAllowance(context(db, { attempts: 1 }));
    const repeated = await consumeFreeTierAllowance(context(db, { attempts: 1 }));
    const conflictingRelease = await releaseFreeTierAllowance(context(db, {
      reasonCode: 'UPSTREAM_503',
    }));

    expect(first).toMatchObject({ created: true, state: 'consumed' });
    expect(repeated).toMatchObject({ created: false, idempotent: true, state: 'consumed' });
    expect(conflictingRelease).toMatchObject({ created: false, state: 'consumed' });
    expect(db.events.filter((event) => event.event_type === 'ai.free_tier.consumed')).toHaveLength(1);
    expect(db.events.filter((event) => event.event_type === 'ai.free_tier.released')).toHaveLength(0);

    const status = await getFreeTierAllowanceStatus(context(db));
    expect(status.user).toMatchObject({ used: 1, reserved: 0, remaining: 0 });
  });

  test('release restores daily entitlement but preserves the dispatched minute attempt', async () => {
    const db = new FreeTierLedgerDb();
    await reserveFreeTierAllowance(context(db));
    await releaseFreeTierAllowance(context(db, {
      reasonCode: 'UPSTREAM_UNAVAILABLE',
      httpStatus: 503,
      retryAfterSeconds: 4,
      attempts: 1,
    }));

    const afterRelease = await getFreeTierAllowanceStatus(context(db));
    expect(afterRelease.user).toMatchObject({ used: 0, reserved: 0, remaining: 1 });
    expect(afterRelease.shared).toMatchObject({ used: 0, reserved: 0, remaining: 1 });
    expect(afterRelease.minute).toMatchObject({ used: 1, remaining: 1 });

    const replacement = await reserveFreeTierAllowance(context(db, { correlationId: SECOND }));
    const third = await reserveFreeTierAllowance(context(db, {
      userId: 'user-b',
      correlationId: THIRD,
    }));
    expect(replacement.allowed).toBe(true);
    expect(third.code).toBe('FREE_TIER_SHARED_DAILY_LIMIT');
    expect(replacement.status.minute).toMatchObject({ used: 2, remaining: 0 });
  });

  test('stores only bounded release metadata', async () => {
    const db = new FreeTierLedgerDb();
    await reserveFreeTierAllowance(context(db));
    await releaseFreeTierAllowance(context(db, {
      reasonCode: 'NETWORK_TIMEOUT',
      httpStatus: 503,
      retryAfterSeconds: 7,
      attempts: 1,
      prompt: 'private prompt',
      messages: ['private message'],
      tools: ['private tool'],
      apiKey: 'private credential',
      response: 'private raw response',
    }));

    const release = db.events.find((event) => event.event_type === 'ai.free_tier.released');
    expect(release.payload).toEqual({
      status: 'released',
      source: 'task-worker',
      reasonCode: 'NETWORK_TIMEOUT',
      httpStatus: 503,
      retryAfterSeconds: 7,
      attempts: 1,
    });
    expect(JSON.stringify(release)).not.toMatch(/private prompt|private message|private tool|credential|raw/);
  });

  test('requires the original private correlation context', async () => {
    const db = new FreeTierLedgerDb();
    await expect(consumeFreeTierAllowance(context(db))).rejects.toMatchObject({
      code: 'FREE_TIER_RESERVATION_NOT_FOUND',
    });

    await reserveFreeTierAllowance(context(db));
    await expect(consumeFreeTierAllowance(context(db, {
      workspaceId: 'workspace-b',
    }))).rejects.toMatchObject({
      code: 'FREE_TIER_CORRELATION_CONFLICT',
    });
  });
});
