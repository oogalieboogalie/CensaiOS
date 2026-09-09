import { withTransaction } from '../operational-intelligence/transactions.js';
import { buildFreeTierEventPayload } from './freeTierEventPayload.js';
import {
  acquireAllowanceLocks,
  insertAllowanceEvent,
  readCorrelationEvents,
  resolveAllowancePeriods,
} from './freeTierAllowanceSql.js';
import {
  assertCorrelationOwner,
  correlationState,
  FreeTierAllowanceError,
  normalizeAllowanceContext,
} from './freeTierAllowanceState.js';

function requireDatabase(db) {
  if (!db || typeof db.connect !== 'function') {
    throw new FreeTierAllowanceError('FREE_TIER_LEDGER_UNAVAILABLE', 'database is unavailable');
  }
}

function settlementEventType(outcome) {
  if (outcome === 'consumed') return 'ai.free_tier.consumed';
  if (outcome === 'released') return 'ai.free_tier.released';
  throw new FreeTierAllowanceError('FREE_TIER_INVALID_SETTLEMENT', 'invalid settlement outcome');
}

export async function settleFreeTierAllowance(input) {
  requireDatabase(input?.db);
  const context = normalizeAllowanceContext(input);
  const eventType = settlementEventType(input.outcome);

  return withTransaction(input.db, async (client) => {
    const periods = await resolveAllowancePeriods(client, input.now);
    await acquireAllowanceLocks(client, [
      `04:free-ai:correlation:${context.correlationId}`,
    ]);

    const events = await readCorrelationEvents(client, context.correlationId);
    assertCorrelationOwner(events, context);
    const currentState = correlationState(events);
    if (currentState !== 'reserved') {
      return {
        settled: true,
        created: false,
        idempotent: true,
        state: currentState,
        correlationId: context.correlationId,
      };
    }

    await insertAllowanceEvent(client, {
      workspaceId: context.workspaceId,
      userId: context.userId,
      correlationId: context.correlationId,
      eventType,
      createdAt: periods.now,
      payload: buildFreeTierEventPayload(eventType, input),
    });

    return {
      settled: true,
      created: true,
      idempotent: false,
      state: input.outcome,
      correlationId: context.correlationId,
    };
  });
}

export function consumeFreeTierAllowance(input) {
  return settleFreeTierAllowance({ ...input, outcome: 'consumed' });
}

export function releaseFreeTierAllowance(input) {
  return settleFreeTierAllowance({ ...input, outcome: 'released' });
}
