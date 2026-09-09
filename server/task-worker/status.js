import { dbReady } from '../dbState.js';
import { 
  state, MAX_CONCURRENT, POLL_INTERVAL_MS, DB_UNAVAILABLE_WORKER_MESSAGE 
} from './shared.js';

export function getTaskWorkerStatus(
  databaseConnected = dbReady(),
  ownership = { ready: true, blockingTaskCount: 0 },
) {
  const blockedByDatabase = !databaseConnected;
  const blockedByOwnership = !ownership.ready && ownership.blockingTaskCount > 0;
  const workerReady = state.running && !blockedByDatabase && !blockedByOwnership;
  const reason = blockedByDatabase
    ? 'database_unavailable'
    : blockedByOwnership
      ? 'agent_task_ownership_ambiguous'
      : state.running
        ? null
        : (state.disabledReason || 'worker_not_started');

  return {
    ready: workerReady,
    running: state.running,
    activeCount: state.activeCount,
    maxConcurrent: MAX_CONCURRENT,
    pollIntervalMs: POLL_INTERVAL_MS,
    degraded: !workerReady,
    degradedReason: reason,
    message: reason === 'database_unavailable'
      ? DB_UNAVAILABLE_WORKER_MESSAGE
      : reason === 'agent_task_ownership_ambiguous'
        ? 'Agent task worker: blocked by active tasks with ambiguous ownership'
      : reason === 'worker_not_started'
        ? 'Agent task worker: disabled (worker not started)'
        : state.lastPollError
          ? `Agent task worker: degraded (${state.lastPollError})`
          : 'Agent task worker: enabled',
    lastPollError: state.lastPollError,
    ownership: {
      legacyTaskCount: ownership.legacyTaskCount ?? 0,
      blockingTaskCount: ownership.blockingTaskCount ?? 0,
    },
  };
}
