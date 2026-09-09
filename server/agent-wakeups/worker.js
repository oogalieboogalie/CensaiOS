import { dbReady } from '../dbState.js';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { claimAgentWakeup, requeueInProgressAgentWakeups } from './store.js';
import { runAgentWakeup } from './execution.js';
import { runRestartSelfCheck } from './restartSelfCheck.js';

const log = createLogger('agentWakeups');
const POLL_MS = 3000;
const MAX_CONCURRENT = 2;
const RESTART_CHECK_DELAY_MS = 25000;
const PROCESS_STARTED_AT = new Date();
const state = {
  running: false,
  active: 0,
  recovered: false,
  lastPollError: null,
};
let restartSelfCheckScheduled = false;
let restartSelfCheckHandle = null;
let intervalHandle = null;

async function recoverInterruptedWakeups() {
  if (state.recovered) return;
  const recovered = await requeueInProgressAgentWakeups();
  state.recovered = true;
  log.info('recovered interrupted agent wakeups', recovered);
}

function scheduleRestartSelfCheckOnce() {
  if (restartSelfCheckScheduled) return;
  restartSelfCheckScheduled = true;
  log.info('scheduling restart self-check', { delayMs: RESTART_CHECK_DELAY_MS });
  restartSelfCheckHandle = setTimeout(() => {
    restartSelfCheckHandle = null;
    Promise.resolve(runRestartSelfCheck({
      db: pool,
      log,
      processStartedAt: PROCESS_STARTED_AT,
      scheduledDelayMs: RESTART_CHECK_DELAY_MS,
    })).catch((err) => log.error('restart self-check crashed', { error: err.message }));
  }, RESTART_CHECK_DELAY_MS);
  if (typeof restartSelfCheckHandle.unref === 'function') restartSelfCheckHandle.unref();
}

export async function pollAgentWakeups() {
  if (!dbReady() || state.active >= MAX_CONCURRENT) return;
  scheduleRestartSelfCheckOnce();
  try {
    await recoverInterruptedWakeups();
    const wake = await claimAgentWakeup();
    if (!wake) {
      state.lastPollError = null;
      return;
    }
    state.active += 1;
    runAgentWakeup(wake)
      .catch(err => log.error('wake failed', { wakeId: wake.id, error: err.message }))
      .finally(() => { state.active -= 1; });
    state.lastPollError = null;
  } catch (err) {
    state.lastPollError = err.message;
    log.error('poll failed', { error: err.message });
  }
}

export function startAgentWakeupWorker() {
  if (state.running) return;
  state.running = true;
  log.info('agent wakeup worker enabled', { pollIntervalMs: POLL_MS, maxConcurrent: MAX_CONCURRENT });
  if (dbReady()) recoverInterruptedWakeups().catch((err) => {
    state.lastPollError = err.message;
    log.error('startup recovery failed', { error: err.message });
  });
  intervalHandle = setInterval(pollAgentWakeups, POLL_MS);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
}

export function getAgentWakeupWorkerStatus(
  databaseConnected = dbReady(),
  ownership = { ready: true, blockingWakeupCount: 0 },
) {
  const ownershipReady = ownership.blockingWakeupCount === 0;
  return {
    ready: state.running && databaseConnected && ownershipReady,
    running: state.running,
    activeCount: state.active,
    maxConcurrent: MAX_CONCURRENT,
    pollIntervalMs: POLL_MS,
    recovered: state.recovered,
    lastPollError: state.lastPollError,
    ownership: {
      legacyMessageCount: ownership.legacyMessageCount ?? 0,
      blockingWakeupCount: ownership.blockingWakeupCount ?? 0,
    },
  };
}

export function stopAgentWakeupWorkerForTests() {
  if (intervalHandle) clearInterval(intervalHandle);
  if (restartSelfCheckHandle) clearTimeout(restartSelfCheckHandle);
  intervalHandle = null;
  restartSelfCheckHandle = null;
  state.running = false;
  state.active = 0;
  state.recovered = false;
  state.lastPollError = null;
  restartSelfCheckScheduled = false;
}
