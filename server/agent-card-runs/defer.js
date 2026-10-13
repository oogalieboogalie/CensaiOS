// Agent card runs: put a run back in the queue for later (server/agentNetwork relay waits).

import pool from '../db.js';

/**
 * Put a claimed run back in the queue to look again later (a call that is
 * waiting at the relay for an install that is offline). `patch` is merged
 * into the run's metadata; the run is not claimed again before notBefore.
 */
export async function deferAgentCardRun({ db = pool, runId, delayMs, patch = {} }) {
  const notBefore = new Date(Date.now() + Math.max(0, Number(delayMs) || 0)).toISOString();
  await db.query(
    `UPDATE runs SET status='pending', updated_at=NOW(), metadata = metadata || $2::jsonb
     WHERE id=$1 AND status='running'`,
    [runId, JSON.stringify({ ...patch, notBefore })],
  );
  return notBefore;
}
