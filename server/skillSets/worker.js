// Every minute: run any board's Idea Foundry that is due.
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { tickIdeaFoundry } from './foundry.js';

const log = createLogger('idea-foundry');
const TICK_MS = 60 * 1000;
let handle = null;
let busy = false;

async function tick() {
  if (busy || !dbReady()) return;
  busy = true;
  try { await tickIdeaFoundry(pool); } catch (error) { log.warn('tick failed', { code: safeErrorCode(error) }); } finally { busy = false; }
}

export function startIdeaFoundryWorker() {
  if (handle) return;
  handle = setInterval(tick, TICK_MS);
  handle.unref?.();
}
