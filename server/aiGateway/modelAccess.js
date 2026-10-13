import { randomUUID } from 'node:crypto';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { consumeFreeTierAllowance, releaseFreeTierAllowance, reserveFreeTierAllowance } from './freeTierAllowance.js';
import { applyUserModelAccess, resolveUserModelAccess } from './modelByokAccess.js';
import { resolveFreeTierRuntime } from './freeTierRuntime.js';
import { RUNTIME_MODES } from '../middleware/runtimeMode.js';
const INTERNAL_CONTEXT = Symbol('censai.model-access.server-context');
const CHAT_KIND = 'chat.completion';
export class ModelAccessError extends Error {
  constructor(code, message, statusCode, retryAfter = null) {
    super(message);
    Object.assign(this, {
      name: 'ModelAccessError', code, status: statusCode, statusCode, retryAfter,
    });
  }
}
function text(value, field) {
  const result = String(value ?? '').trim();
  if (!result) throw new TypeError(`${field} is required`);
  return result;
}
export function createModelAccessContext({ userId, workspaceId, source }) {
  return Object.freeze({
    userId: text(userId, 'userId'),
    workspaceId: text(workspaceId, 'workspaceId'),
    source: text(source, 'source'), [INTERNAL_CONTEXT]: true,
  });
}
function requireInternalContext(context) {
  if (!context?.[INTERNAL_CONTEXT]) {
    throw new ModelAccessError('MODEL_ACCESS_CONTEXT_REQUIRED',
      'Verified server model-access context is required', 403);
  }
  return context;
}
function unavailable(code = 'MODEL_ACCESS_UNAVAILABLE') {
  return new ModelAccessError(code, 'AI access is temporarily unavailable', 503, 5);
}
async function verifyPrincipal(context, db) {
  try {
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [context.userId]);
    if (!rows[0]) {
      throw new ModelAccessError('MODEL_ACCESS_DENIED', 'User access denied', 403);
    }
    await requireWorkspaceMember(db, {
      userId: context.userId,
      workspaceId: context.workspaceId,
    });
    return String(rows[0].role || 'user').toLowerCase();
  } catch (error) {
    if (error instanceof ModelAccessError) throw error;
    if ([403, 404].includes(error?.statusCode)) {
      throw new ModelAccessError('MODEL_ACCESS_DENIED', 'Workspace access denied', 403);
    }
    throw unavailable();
  }
}
function boundedRetryAfter(error) {
  const raw = error?.retryAfter ?? error?.retryAfterSeconds;
  const seconds = Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.min(86_400, Math.ceil(seconds))) : null;
}
function platformFailure(error) {
  if (error instanceof ModelAccessError) return error;
  const status = Number(error?.statusCode ?? error?.status);
  const retryAfter = boundedRetryAfter(error);
  if (status === 429) {
    return new ModelAccessError('FREE_TIER_PROVIDER_RATE_LIMIT',
      'The free AI provider is temporarily rate limited', 429, retryAfter);
  }
  return new ModelAccessError('FREE_TIER_PROVIDER_UNAVAILABLE',
    'The free AI provider is temporarily unavailable', 503, retryAfter);
}
function quotaError(result) {
  const band = result.code === 'FREE_TIER_SHARED_MINUTE_LIMIT'
    ? result.status.minute
    : result.code === 'FREE_TIER_SHARED_DAILY_LIMIT'
      ? result.status.shared
      : result.status.user;
  const seconds = Math.max(1, Math.ceil((new Date(band.resetsAt) - Date.now()) / 1000));
  return new ModelAccessError(result.code, 'Free AI request allowance reached', 429, seconds);
}
export async function resolveModelAccess(input) {
  let runtime;
  try {
    runtime = resolveFreeTierRuntime();
  } catch {
    throw unavailable('FREE_TIER_CONFIG_UNAVAILABLE');
  }
  if (!runtime.enabled && runtime.runtimeMode !== RUNTIME_MODES.CLOUD_SAAS) {
    return { governed: false };
  }
  const context = requireInternalContext(input.accessContext);
  const { default: db } = await import('../db.js');
  const role = await verifyPrincipal(context, db);
  const attribution = { workspaceId: context.workspaceId,
    actor: { kind: 'user', id: context.userId }, source: context.source };
  if (role === 'admin' || role === 'operator') return { governed: true, mode: 'privileged', context, attribution };
  try {
    const userAccess = await resolveUserModelAccess({
      input, context, attribution, policy: runtime.enabled ? runtime.config : null,
    });
    if (userAccess) return userAccess;
  } catch {
    throw unavailable();
  }
  if (!runtime.enabled) {
    throw new ModelAccessError(
      'MODEL_ACCESS_PERSONAL_KEY_REQUIRED',
      'A personal API key is required for this AI route',
      403,
    );
  }
  if (input.kind !== CHAT_KIND) throw new ModelAccessError('PLATFORM_MODEL_KIND_DENIED',
    'A personal key is required', 403);
  let platform;
  try {
    platform = resolveFreeTierRuntime({ requirePlatformKey: true });
  } catch {
    throw unavailable('FREE_TIER_CONFIG_UNAVAILABLE');
  }
  let reservation;
  try {
    reservation = await reserveFreeTierAllowance({
      db,
      config: platform.config,
      userId: context.userId,
      workspaceId: context.workspaceId,
      source: context.source,
      correlationId: randomUUID(),
    });
  } catch {
    throw unavailable('FREE_TIER_LEDGER_UNAVAILABLE');
  }
  if (!reservation.allowed || !reservation.dispatchAllowed) {
    if (String(reservation.code || '').endsWith('_LIMIT')) throw quotaError(reservation);
    throw unavailable('FREE_TIER_LEDGER_UNAVAILABLE');
  }
  return {
    governed: true, mode: 'platform-free', context, attribution,
    policy: platform.config, platformKey: platform.platformKey, reservation, db,
  };
}
export function applyModelAccess(access, { config, body, retry }) {
  if (!access.governed || access.mode === 'privileged') return { config, body, retry };
  if (access.mode === 'byok' || access.mode === 'byok-free') {
    return applyUserModelAccess(access, { config, body, retry });
  }
  return {
    config: {
      provider: access.policy.provider,
      model: access.policy.model,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: access.platformKey,
    },
    body: { ...body, model: access.policy.model },
    retry: { maxRetries: 0 },
  };
}
export function isValidChatCompletion(result) {
  const message = result?.choices?.[0]?.message;
  return Boolean(message && ((typeof message.content === 'string' && message.content.trim())
    || (Array.isArray(message.tool_calls) && message.tool_calls.length > 0)));
}
function settlementInput(access, metadata = {}) {
  return {
    db: access.db,
    userId: access.context.userId,
    workspaceId: access.context.workspaceId,
    source: access.context.source,
    correlationId: access.reservation.correlationId,
    attempts: 1,
    ...metadata,
  };
}

export async function settleModelAccessSuccess(access, result) {
  if (access.mode !== 'platform-free') return result;
  if (!isValidChatCompletion(result)) {
    const error = new ModelAccessError('FREE_TIER_INVALID_COMPLETION',
      'The free AI provider returned an invalid completion', 503);
    try { await releaseFreeTierAllowance(settlementInput(access, { reasonCode: error.code })); }
    catch { throw unavailable('FREE_TIER_LEDGER_UNAVAILABLE'); }
    throw error;
  }
  try {
    await consumeFreeTierAllowance(settlementInput(access));
    return result;
  } catch {
    try { await releaseFreeTierAllowance(settlementInput(access, { reasonCode: 'SETTLEMENT_FAILED' })); }
    catch { /* the normalized ledger error below is still authoritative */ }
    throw unavailable('FREE_TIER_LEDGER_UNAVAILABLE');
  }
}

export async function settleModelAccessFailure(access, error) {
  if (access.mode !== 'platform-free') throw error;
  const normalized = platformFailure(error);
  try {
    await releaseFreeTierAllowance(settlementInput(access, {
      reasonCode: normalized.code,
      httpStatus: Number(error?.statusCode ?? error?.status) || normalized.status,
      retryAfterSeconds: normalized.retryAfter ?? undefined,
    }));
  } catch {
    throw unavailable('FREE_TIER_LEDGER_UNAVAILABLE');
  }
  throw normalized;
}
