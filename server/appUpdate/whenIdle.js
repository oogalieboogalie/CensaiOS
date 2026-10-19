/**
 * Put an update in without cutting an agent off: when an agent is mid-task,
 * the restart request waits here until every agent has finished (the
 * restart stops the server, and with it any answer still being written).
 */

import { createLogger } from '../logger.js';
import { busyAgents } from './busy.js';
import { assertRestartable, requestRestart, updateDir } from './index.js';

const log = createLogger('app-update');
const LOOK_EVERY_MS = 2000;
const GIVE_UP_MS = 30 * 60_000;

let pending = null;

/** { waiting, since, agents } while a restart waits for agents to finish. */
export function pendingRestart() {
  return pending ? { waiting: true, since: pending.since, agents: pending.agents } : { waiting: false };
}

export function cancelPendingRestart() {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}

/**
 * Restart now when no agent is working, else as soon as they all finish.
 * Throws what requestRestart throws (nothing waiting, no updater).
 */
export async function restartWhenIdle({
  dir = updateDir(), busy = busyAgents, restart = requestRestart, check = assertRestartable, every = LOOK_EVERY_MS, giveUpMs = GIVE_UP_MS,
} = {}) {
  const agents = await busy();
  if (!agents.length) {
    cancelPendingRestart();
    log.info('update asked for, no agent working: restarting now');
    return restart({ dir });
  }
  // Check the update is still there and the updater runs before promising.
  check(dir);
  if (pending) return { requested: false, ...pendingRestart() };
  const since = Date.now();
  pending = { since, agents, timer: null };
  log.info(`update asked for, waiting for ${agents.length} agent(s) to finish first`);
  const look = async () => {
    if (!pending) return;
    const still = await busy().catch(() => []);
    if (still.length && Date.now() - since < giveUpMs) {
      pending.agents = still;
      pending.timer = setTimeout(look, every);
      return;
    }
    pending = null;
    if (still.length) {
      log.warn(`gave up waiting for ${still.length} agent(s); the update stays ready`);
      return;
    }
    try {
      restart({ dir });
      log.info('agents finished: restarting into the update');
    } catch (error) {
      log.warn(`restart after agents finished failed: ${error?.message || error}`);
    }
  };
  pending.timer = setTimeout(look, every);
  return { requested: false, ...pendingRestart() };
}
