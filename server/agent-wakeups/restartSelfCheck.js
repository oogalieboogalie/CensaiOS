/**
 * Restart self-check: one-shot, lightweight liveness probe that fires roughly 20–30 seconds
 * after the agent-wakeup worker first polls. Its job is to prove the server came back cleanly
 * after a restart without waiting for a human to notice.
 *
 * Design notes (see .team/handoffs/2026-06-23-restart-self-check.md for the contract):
 *  - This module never throws. Every failure is caught and surfaced via the injected logger
 *    so a misbehaving probe cannot crash the worker that scheduled it.
 *  - The event is emitted via the existing `createWorkspaceEvent` seam from
 *    server/operational-intelligence/factories.js. No new SQL, no new tables.
 *  - Sibling worker status and the clock are injectable so unit tests stay hermetic.
 */
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';

export const RESTART_SELF_CHECK_EVENT_TYPE = 'agent.runtime.restart_self_check';
const DEFAULT_WORKSPACE_ID = 'default';
const DEFAULT_ACTOR = { kind: 'system', id: 'restart-self-check' };

/**
 * Probe DB and sibling workers, then emit a `agent.runtime.restart_self_check` workspace event.
 *
 * @param {object} ctx
 * @param {object} ctx.db - Postgres-shaped client with `.query(sql, params)`.
 * @param {object} ctx.log - Structured logger with `.info(msg, meta)` / `.warn(...)` / `.error(...)`.
 * @param {Date}   ctx.processStartedAt - When the calling process loaded its modules.
 * @param {number} ctx.scheduledDelayMs - The delay that was waited before running (e.g. 25000).
 * @param {string} [ctx.workspaceId='default'] - Workspace the event belongs to.
 * @param {{kind:string,id:string}} [ctx.actor] - Actor of record for the event.
 * @param {() => Date} [ctx.now] - Injectable clock for tests.
 * @param {(args:{db:object}) => Promise<Array<{name:string,running:boolean}>>} [ctx.getSiblingWorkerStatuses]
 *   - Returns sibling worker status rows. Defaults to taskWorker + schedulerWorker.
 * @returns {Promise<{event: object|null, payload: object, error: string|null}>}
 */
export async function runRestartSelfCheck(ctx) {
  const {
    db,
    log,
    processStartedAt,
    scheduledDelayMs,
    workspaceId = DEFAULT_WORKSPACE_ID,
    actor = DEFAULT_ACTOR,
    now = defaultNow,
    getSiblingWorkerStatuses = defaultSiblingWorkerStatuses,
  } = ctx || {};

  if (!db) throw new Error('restartSelfCheck: db is required');
  if (!log) throw new Error('restartSelfCheck: log is required');
  if (!(processStartedAt instanceof Date) || Number.isNaN(processStartedAt.getTime())) {
    throw new Error('restartSelfCheck: processStartedAt must be a valid Date');
  }
  if (!Number.isFinite(scheduledDelayMs) || scheduledDelayMs < 0) {
    throw new Error('restartSelfCheck: scheduledDelayMs must be a non-negative number');
  }

  const startedAtIso = now().toISOString();

  let dbOk = false;
  let dbError = null;
  try {
    await db.query('SELECT 1');
    dbOk = true;
  } catch (err) {
    dbError = (err && err.message) || String(err);
    log.warn('restart self-check: db probe failed', { error: dbError });
  }

  let agentsCount = 0;
  if (dbOk) {
    try {
      const { rows } = await db.query('SELECT COUNT(*)::int AS count FROM agents');
      agentsCount = Number(rows[0]?.count ?? 0);
    } catch (err) {
      log.warn('restart self-check: agents count failed', { error: err.message });
    }
  }

  let siblingWorkersActive = 0;
  let siblingProbeError = null;
  try {
    const statuses = await getSiblingWorkerStatuses({ db });
    siblingWorkersActive = statuses.filter((s) => s && s.running === true).length;
  } catch (err) {
    siblingProbeError = (err && err.message) || String(err);
    log.warn('restart self-check: sibling worker probe failed', { error: siblingProbeError });
  }

  const checkCompletedAt = now();
  const verdict = dbOk ? 'ok' : 'degraded';

  const payload = {
    processStartedAt: processStartedAt.toISOString(),
    scheduledDelayMs,
    checkCompletedAt: checkCompletedAt.toISOString(),
    dbOk,
    agentsCount,
    siblingWorkersActive,
    verdict,
    scheduledAt: startedAtIso,
    elapsedMs: checkCompletedAt.getTime() - processStartedAt.getTime(),
    dbError,
    siblingProbeError,
  };

  let event = null;
  let emitError = null;
  try {
    event = await createWorkspaceEvent({ db }, {
      workspaceId,
      type: RESTART_SELF_CHECK_EVENT_TYPE,
      actor,
      payload,
    });
  } catch (err) {
    emitError = (err && err.message) || String(err);
    log.error('restart self-check: workspace event emit failed', {
      error: emitError,
      verdict,
    });
  }

  log.info('restart self-check completed', {
    verdict,
    dbOk,
    agentsCount,
    siblingWorkersActive,
    eventId: event?.id,
  });

  return { event, payload, error: emitError };
}

function defaultNow() {
  return new Date();
}

async function defaultSiblingWorkerStatuses({ db }) {
  // Lazy imports so unit tests that override getSiblingWorkerStatuses do not pull in
  // the worker modules unnecessarily.
  const { getTaskWorkerStatus } = await import('../taskWorker.js');
  const { getSchedulerWorkerStatus } = await import('../schedulerWorker.js');
  const { getAgentCardRunWorkerStatus } = await import('../agent-card-runs/worker.js');
  return [
    { name: 'taskWorker', running: Boolean(getTaskWorkerStatus()?.running) },
    { name: 'schedulerWorker', running: Boolean(getSchedulerWorkerStatus()?.running) },
    { name: 'agentCardWorker', running: Boolean(getAgentCardRunWorkerStatus()?.running) },
  ];
}
