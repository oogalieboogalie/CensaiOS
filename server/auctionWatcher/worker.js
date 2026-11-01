// Checks due watches once a minute, a few at a time, one after another.
// Each watch has its own interval (15 minutes at the least), so a site never
// hears from one watch more often than that.

import { dbReady } from '../dbState.js';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { checkWatch } from './check.js';
import { claimDueWatches } from './store.js';

const log = createLogger('auction-watcher');
const POLL_MS = 60_000;
let busy = false;
let handle = null;

export async function pollAuctionWatches({ db = pool, ready = dbReady, check = checkWatch } = {}) {
  if (busy || !ready()) return 0;
  busy = true;
  try {
    const due = await claimDueWatches(db, 3);
    for (const watch of due) await check(db, watch);
    return due.length;
  } catch (err) {
    if (!/auction_watches/.test(err.message)) log.error('poll failed', { code: safeErrorCode(err) });
    return 0;
  } finally {
    busy = false;
  }
}

export function startAuctionWatcherWorker() {
  if (handle) return;
  log.info('auction watcher worker enabled', { pollIntervalMs: POLL_MS });
  handle = setInterval(() => { pollAuctionWatches(); }, POLL_MS);
  if (typeof handle.unref === 'function') handle.unref();
}
