import { dbReady } from './dbState.js';
import {
  claimNextDueSchedule,
  getRunningScheduleRuns,
  updateSchedule,
} from './memory/schedules.js';
import { getAgents } from './memory/core/agents.js';
import { monthlyAnchorDay, nextRunAfter } from './memory/schedules_utils.js';
import { createLogger } from './logger.js';
import { safeErrorCode } from './security/errorCode.js';
import {
  resolveScheduledAssignee,
} from './scheduler/assignees.js';
import { enqueueCoreScheduleRun } from './scheduler/coreRuns.js';
import { gateAgentWakeUp } from './wakeUps/store.js';
import pool from './db.js';

export { resolveScheduledAssignee, resolveScheduledAssigneeId } from './scheduler/assignees.js';

const log = createLogger('scheduler');
const POLL_INTERVAL_MS = Math.max(5000, Number(process.env.SCHEDULER_POLL_INTERVAL_MS) || 30000);

let running = false;
let tickBusy = false;
let activeScheduleId = null;
let lastPollError = null;
let intervalHandle = null;

async function failSchedule(schedule, err) {
  await updateSchedule(schedule.id, {
    status: 'failed',
    last_error: err.message,
  });
}

async function completeOrRepeatSchedule(schedule) {
  if (schedule.repeat_enabled) {
    // The saved date holds a 29th, 30th or 31st after a short month has
    // shortened the run. The repeat clock is the configured zone, not a column.
    const days = schedule.repeat_freq === 'monthly'
      ? (monthlyAnchorDay(schedule.scheduled_date) ?? schedule.repeat_days)
      : schedule.repeat_days;
    // scheduled_time is the clock we return to. A spring-forward hole shifts
    // one run forward; the next run uses this time again, not the shifted one.
    const nextRun = nextRunAfter(
      schedule.next_run_at || new Date(),
      schedule.repeat_freq,
      days,
      new Date(),
      undefined,
      schedule.scheduled_time,
    );
    await updateSchedule(schedule.id, {
      status: 'active',
      next_run_at: nextRun,
      last_error: null,
      last_run_id: null,
    });
    return;
  }

  await updateSchedule(schedule.id, {
    status: 'completed',
    last_error: null,
  });
}

export async function reconcileCoreScheduleRuns() {
  const schedules = await getRunningScheduleRuns();
  for (const schedule of schedules) {
    try {
      if (schedule.run_status === 'succeeded') {
        await completeOrRepeatSchedule(schedule);
      } else if (schedule.run_status === 'failed' || schedule.run_status === 'cancelled') {
        await failSchedule(schedule, new Error(schedule.run_error || `Run ${schedule.run_status}.`));
      }
    } catch (err) {
      // One row must not stay 'running' and block every later claim.
      log.error('schedule reconcile failed', { scheduleId: schedule.id, code: safeErrorCode(err) });
      try {
        await failSchedule(schedule, err);
      } catch (failErr) {
        log.error('schedule reconcile failed', { scheduleId: schedule.id, code: safeErrorCode(failErr) });
      }
    }
  }
  return schedules.length;
}

export async function tickScheduler() {
  if (tickBusy) return;
  if (!dbReady()) {
    lastPollError = 'database_unavailable';
    return;
  }

  tickBusy = true;
  try {
    await reconcileCoreScheduleRuns();
    const schedule = await claimNextDueSchedule();
    if (!schedule) {
      lastPollError = null;
      return;
    }

    activeScheduleId = schedule.id;
    // Censai's own wake-ups: paused when switched off, held back past the daily cap.
    const hold = schedule.set_by_agent ? await gateAgentWakeUp(pool, schedule) : null;
    if (hold) {
      await updateSchedule(schedule.id, hold);
      log.info('agent wake-up held', { scheduleId: schedule.id, status: hold.status });
      lastPollError = null;
      return;
    }
    const coreAgents = await getAgents();
    const assignee = resolveScheduledAssignee(schedule.agent_id, coreAgents, []);
    if (!assignee) {
      throw new Error(`No active core family agent matches scheduled assignee "${schedule.agent_id}".`);
    }

    const queued = await enqueueCoreScheduleRun(schedule, assignee.id);
    log.info('schedule fired → core run queued', {
      scheduleId: schedule.id, assignee: assignee.id, runId: queued.runId,
    });
    lastPollError = null;
  } catch (err) {
    lastPollError = err.message;
    if (activeScheduleId) {
      await failSchedule({ id: activeScheduleId }, err).catch(() => {});
    }
    log.error('tick error', { scheduleId: activeScheduleId, code: safeErrorCode(err) });
  } finally {
    activeScheduleId = null;
    tickBusy = false;
  }
}

export function getSchedulerWorkerStatus({
  databaseConnected = dbReady(),
  ownership = { ready: true, legacyUnownedCount: 0, blockingUnownedCount: 0 },
} = {}) {
  return {
    ready: running && databaseConnected && ownership.ready,
    running,
    activeScheduleId,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastPollError,
    ownership,
  };
}

export function startSchedulerWorker() {
  if (running) return;
  running = true;
  log.info('scheduler worker enabled', { pollIntervalMs: POLL_INTERVAL_MS });
  intervalHandle = setInterval(tickScheduler, POLL_INTERVAL_MS);
  setTimeout(tickScheduler, 5000);
}

export function stopSchedulerWorkerForTests() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  running = false;
  tickBusy = false;
  activeScheduleId = null;
  lastPollError = null;
}
