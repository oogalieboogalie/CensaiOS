import { createLogger } from '../logger.js';

export const log = createLogger('taskWorker');

export const MAX_CONCURRENT = 3;
export const POLL_INTERVAL_MS = 5000;
export const TASK_TIMEOUT_MS = 120000;
export const MAX_ROUNDS = 30;
export const DB_UNAVAILABLE_WORKER_MESSAGE = 'Agent task worker: disabled (database unavailable)';
export const TASK_SUBMISSION_PREVIEW_CHARS = 1200;

export const state = {
  running: false,
  activeCount: 0,
  disabledReason: null,
  lastPollError: null,
};
