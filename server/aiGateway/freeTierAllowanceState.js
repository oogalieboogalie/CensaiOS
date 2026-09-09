import { FREE_TIER_DEFAULTS } from './freeTierConfig.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_PATTERN = /^[a-zA-Z0-9_.:/-]+$/;

export class FreeTierAllowanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FreeTierAllowanceError';
    this.code = code;
  }
}

function requiredText(value, field, maxLength = 200) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) {
    throw new FreeTierAllowanceError('FREE_TIER_INVALID_CONTEXT', `${field} is required`);
  }
  return text;
}

function positiveLimit(value, fallback, field) {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new FreeTierAllowanceError('FREE_TIER_INVALID_POLICY', `${field} must be positive`);
  }
  return limit;
}

export function normalizeAllowanceIdentity(input) {
  const source = requiredText(input.source ?? 'unknown', 'source', 64);
  if (!SOURCE_PATTERN.test(source)) {
    throw new FreeTierAllowanceError('FREE_TIER_INVALID_CONTEXT', 'source is invalid');
  }
  return {
    workspaceId: requiredText(input.workspaceId, 'workspaceId'),
    userId: requiredText(input.userId, 'userId'),
    source,
  };
}

export function normalizeAllowanceContext(input) {
  const identity = normalizeAllowanceIdentity(input);
  const correlationId = requiredText(input.correlationId, 'correlationId', 36);
  if (!UUID_PATTERN.test(correlationId)) {
    throw new FreeTierAllowanceError('FREE_TIER_INVALID_CONTEXT', 'correlationId must be a UUID');
  }
  return { ...identity, correlationId: correlationId.toLowerCase() };
}

export function normalizeAllowancePolicy(config = {}) {
  return {
    provider: String(config.provider ?? FREE_TIER_DEFAULTS.provider),
    model: String(config.model ?? FREE_TIER_DEFAULTS.model),
    userDailyLimit: positiveLimit(
      config.userDailyLimit,
      FREE_TIER_DEFAULTS.userDailyLimit,
      'userDailyLimit',
    ),
    sharedDailyLimit: positiveLimit(
      config.sharedDailyLimit,
      FREE_TIER_DEFAULTS.sharedDailyLimit,
      'sharedDailyLimit',
    ),
    sharedMinuteLimit: positiveLimit(
      config.sharedMinuteLimit,
      FREE_TIER_DEFAULTS.sharedMinuteLimit,
      'sharedMinuteLimit',
    ),
  };
}

export function allowanceLockKeys({ userId, correlationId, dayStart }) {
  const day = String(dayStart).slice(0, 10);
  const keys = [
    '01:free-ai:shared-minute',
    `02:free-ai:shared-day:${day}`,
    `03:free-ai:user-day:${userId}:${day}`,
  ];
  if (correlationId) keys.push(`04:free-ai:correlation:${correlationId}`);
  return keys;
}

function band(limit, used, reserved, resetsAt) {
  return {
    limit,
    used,
    reserved,
    remaining: Math.max(0, limit - used - reserved),
    resetsAt,
  };
}

export function formatAllowanceStatus(counts, policy, periods) {
  return {
    user: band(
      policy.userDailyLimit,
      counts.userUsed,
      counts.userReserved,
      periods.dayEnd,
    ),
    shared: band(
      policy.sharedDailyLimit,
      counts.sharedUsed,
      counts.sharedReserved,
      periods.dayEnd,
    ),
    minute: band(
      policy.sharedMinuteLimit,
      counts.minuteUsed,
      0,
      counts.minuteResetAt,
    ),
  };
}

export function correlationState(events) {
  if (events.some((event) => event.event_type === 'ai.free_tier.consumed')) return 'consumed';
  if (events.some((event) => event.event_type === 'ai.free_tier.released')) return 'released';
  if (events.some((event) => event.event_type === 'ai.free_tier.reserved')) return 'reserved';
  return null;
}

export function assertCorrelationOwner(events, context) {
  const reservation = events.find((event) => event.event_type === 'ai.free_tier.reserved');
  if (!reservation) {
    throw new FreeTierAllowanceError('FREE_TIER_RESERVATION_NOT_FOUND', 'reservation not found');
  }
  if (String(reservation.workspace_id) !== context.workspaceId
    || String(reservation.actor_id) !== context.userId) {
    throw new FreeTierAllowanceError(
      'FREE_TIER_CORRELATION_CONFLICT',
      'correlation belongs to a different allowance context',
    );
  }
  return reservation;
}
