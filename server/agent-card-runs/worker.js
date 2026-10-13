import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { executeAgentCardRun } from './execution.js';
import { claimNextAgentCardRun, recoverInProgressAgentCardRuns } from './store.js';

const log = createLogger('agentCardRuns');
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.AGENT_CARD_RUN_POLL_MS) || 3000);
const MAX_CONCURRENT = Math.max(1, Number(process.env.AGENT_CARD_RUN_CONCURRENCY) || 2);

const state = {
  running: false,
  activeCount: 0,
  recovered: false,
  lastPollError: null,
};

async function recoverInterruptedRuns() {
  if (state.recovered) return;
  const receipt = await recoverInProgressAgentCardRuns();
  state.recovered = true;
  log.info('recovered interrupted AgentCard runs', receipt);
}

export async function pollAgentCardRuns() {
  if (!dbReady() || state.activeCount >= MAX_CONCURRENT) return null;
  try {
    await recoverInterruptedRuns();
    const run = await claimNextAgentCardRun();
    if (!run) {
      state.lastPollError = null;
      return null;
    }
    state.activeCount += 1;
    executeAgentCardRun(run)
      .catch((error) => log.error('run crashed', { runId: run.id, error: error.message }))
      .finally(() => { state.activeCount -= 1; });
    state.lastPollError = null;
    return run.id;
  } catch (error) {
    state.lastPollError = error.message;
    log.error('poll failed', { error: error.message });
    return null;
  }
}

export function startAgentCardRunWorker() {
  if (state.running) return;
  state.running = true;
  log.info('AgentCard run worker enabled', { pollIntervalMs: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT });
  if (dbReady()) recoverInterruptedRuns().catch((error) => {
    state.lastPollError = error.message;
    log.error('startup recovery failed', { error: error.message });
  });
  const timer = setInterval(pollAgentCardRuns, POLL_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

export function getAgentCardRunWorkerStatus(databaseConnected = dbReady()) {
  return {
    ready: state.running && databaseConnected,
    running: state.running,
    activeCount: state.activeCount,
    maxConcurrent: MAX_CONCURRENT,
    pollIntervalMs: POLL_INTERVAL_MS,
    recovered: state.recovered,
    lastPollError: state.lastPollError,
  };
}
