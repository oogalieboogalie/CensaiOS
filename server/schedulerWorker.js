import { dbReady } from './dbState.js';
import {
  claimNextDueSchedule,
  getRunningScheduleRuns,
  updateSchedule,
} from './memory/schedules.js';
import { getAgents } from './memory/core/agents.js';
import { calculateNextRun } from './memory/schedules_utils.js';
import { createLogger } from './logger.js';
import {
  resolveScheduledAssignee,
} from './scheduler/assignees.js';
import { enqueueCoreScheduleRun } from './scheduler/coreRuns.js';

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
    const nextRun = calculateNextRun(schedule.next_run_at || new Date(), schedule.repeat_freq, schedule.repeat_days);
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
    if (schedule.run_status === 'succeeded') {
      await completeOrRepeatSchedule(schedule);
    } else if (schedule.run_status === 'failed' || schedule.run_status === 'cancelled') {
      await failSchedule(schedule, new Error(schedule.run_error || `Run ${schedule.run_status}.`));
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
    log.error('tick error', { scheduleId: activeScheduleId, error: err.message });
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
