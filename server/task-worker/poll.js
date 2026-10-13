import { dbReady } from '../dbState.js';
import { 
  log, state, MAX_CONCURRENT, POLL_INTERVAL_MS, DB_UNAVAILABLE_WORKER_MESSAGE 
} from './shared.js';
import { claimTask } from './claim.js';
import { runTask } from './execution.js';
import { runTaskWithLifecycle } from './runLifecycle.js';
import { requeueInProgressAgentTasks } from '../memory.js';

let requeuedStuckTasks = false;

async function checkAndRequeueStuckTasks() {
  if (requeuedStuckTasks) return;
  try {
    await requeueInProgressAgentTasks();
    requeuedStuckTasks = true;
    log.info('requeued any stuck in_progress agent tasks back to queued status');
  } catch (err) {
    log.error('failed to requeue stuck tasks', { error: err.message });
  }
}

async function poll() {
  if (state.activeCount >= MAX_CONCURRENT) return;
  if (!dbReady()) {
    state.disabledReason = 'database_unavailable';
    return;
  }
  if (state.disabledReason === 'database_unavailable') {
    state.disabledReason = null;
    log.info('task worker activated — database connected');
  }
  
  await checkAndRequeueStuckTasks();

  try {
    const task = await claimTask();
    if (!task) return;
    state.lastPollError = null;
    state.activeCount++;
    runTaskWithLifecycle({ task, executeTask: runTask }).finally(() => { state.activeCount--; });
  } catch (err) {
    state.lastPollError = err.message;
    log.error('poll error', { error: err.message });
  }
}

export function startTaskWorker() {
  if (state.running) return;
  if (!dbReady()) {
    // Keep polling anyway: the readiness loop in boot/database.js may bring
    // the database online later, and poll() gates on dbReady() per tick.
    state.disabledReason = 'database_unavailable';
    log.warn(`${DB_UNAVAILABLE_WORKER_MESSAGE} — will activate when the database connects`);
  } else {
    state.disabledReason = null;
    log.info('task worker enabled', { pollIntervalMs: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT });
    checkAndRequeueStuckTasks().catch(() => {});
  }
  state.running = true;
  setInterval(poll, POLL_INTERVAL_MS);
}
