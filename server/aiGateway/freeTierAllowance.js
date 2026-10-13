import { withTransaction } from '../operational-intelligence/transactions.js';
import { buildFreeTierEventPayload } from './freeTierEventPayload.js';
import {
  acquireAllowanceLocks,
  insertAllowanceEvent,
  readAllowanceCounts,
  readCorrelationEvents,
  resolveAllowancePeriods,
} from './freeTierAllowanceSql.js';
import {
  allowanceLockKeys,
  assertCorrelationOwner,
  correlationState,
  formatAllowanceStatus,
  FreeTierAllowanceError,
  normalizeAllowanceContext,
  normalizeAllowanceIdentity,
  normalizeAllowancePolicy,
} from './freeTierAllowanceState.js';

export { FreeTierAllowanceError } from './freeTierAllowanceState.js';
export {
  consumeFreeTierAllowance,
  releaseFreeTierAllowance,
  settleFreeTierAllowance,
} from './freeTierSettlement.js';

function requireDatabase(db) {
  if (!db || typeof db.connect !== 'function') {
    throw new FreeTierAllowanceError('FREE_TIER_LEDGER_UNAVAILABLE', 'database is unavailable');
  }
}

async function lockedStatus(client, context, policy, periods, correlationId) {
  await acquireAllowanceLocks(client, allowanceLockKeys({
    userId: context.userId,
    correlationId,
    dayStart: periods.dayStart,
  }));
  const counts = await readAllowanceCounts(client, periods, context.userId);
  return { counts, status: formatAllowanceStatus(counts, policy, periods) };
}

function denialCode(status) {
  if (status.user.remaining === 0) return 'FREE_TIER_USER_DAILY_LIMIT';
  if (status.shared.remaining === 0) return 'FREE_TIER_SHARED_DAILY_LIMIT';
  if (status.minute.remaining === 0) return 'FREE_TIER_SHARED_MINUTE_LIMIT';
  return null;
}

export async function getFreeTierAllowanceStatus(input) {
  if (input?.config?.enabled === false) return { enabled: false };
  requireDatabase(input?.db);
  const context = normalizeAllowanceIdentity(input);
  const policy = normalizeAllowancePolicy(input.config);
  return withTransaction(input.db, async (client) => {
    const periods = await resolveAllowancePeriods(client, input.now);
    const { status } = await lockedStatus(client, context, policy, periods);
    return status;
  });
}

export async function reserveFreeTierAllowance(input) {
  if (input?.config?.enabled === false) {
    return {
      allowed: false,
      dispatchAllowed: false,
      created: false,
      state: 'disabled',
      code: 'FREE_TIER_DISABLED',
    };
  }
  requireDatabase(input?.db);
  const context = normalizeAllowanceContext(input);
  const policy = normalizeAllowancePolicy(input.config);

  return withTransaction(input.db, async (client) => {
    const periods = await resolveAllowancePeriods(client, input.now);
    await acquireAllowanceLocks(client, allowanceLockKeys({
      userId: context.userId,
      correlationId: context.correlationId,
      dayStart: periods.dayStart,
    }));

    const priorEvents = await readCorrelationEvents(client, context.correlationId);
    const counts = await readAllowanceCounts(client, periods, context.userId);
    const status = formatAllowanceStatus(counts, policy, periods);

    if (priorEvents.length > 0) {
      assertCorrelationOwner(priorEvents, context);
      const state = correlationState(priorEvents);
      return {
        allowed: state === 'reserved',
        dispatchAllowed: false,
        created: false,
        idempotent: true,
        state,
        code: state === 'reserved'
          ? 'FREE_TIER_RESERVATION_EXISTS'
          : 'FREE_TIER_CORRELATION_SETTLED',
        correlationId: context.correlationId,
        status,
      };
    }

    const code = denialCode(status);
    if (code) {
      return {
        allowed: false,
        dispatchAllowed: false,
        created: false,
        state: 'denied',
        code,
        correlationId: context.correlationId,
        status,
      };
    }

    const eventType = 'ai.free_tier.reserved';
    await insertAllowanceEvent(client, {
      workspaceId: context.workspaceId,
      userId: context.userId,
      correlationId: context.correlationId,
      eventType,
      createdAt: periods.now,
      payload: buildFreeTierEventPayload(eventType, {
        ...input,
        source: context.source,
        provider: policy.provider,
        model: policy.model,
        dayStart: periods.dayStart,
        dayEnd: periods.dayEnd,
      }),
    });
    const after = await readAllowanceCounts(client, periods, context.userId);

    return {
      allowed: true,
      dispatchAllowed: true,
      created: true,
      idempotent: false,
      state: 'reserved',
      correlationId: context.correlationId,
      status: formatAllowanceStatus(after, policy, periods),
    };
  });
}
