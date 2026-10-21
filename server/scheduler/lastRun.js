import pool from '../db.js';
import { createLogger } from '../logger.js';

const log = createLogger('scheduler');
const FAILED_NOTE = 'The run did not finish.';

/**
 * Writes the latest answer and time onto the schedule the card reads.
 * One scheduler log line per finished or failed run. Never the task or the answer.
 */
export async function recordScheduleRunOutcome({
  db = pool,
  scheduleId,
  runId = null,
  agentId = null,
  answer = null,
  failed = false,
} = {}) {
  const id = String(scheduleId || '').trim();
  if (!id) return;
  const saved = answer == null ? null : String(answer).slice(0, 4000);
  let worked = !failed;
  let why = failed ? 'failed' : 'finished';
  try {
    const result = await db.query(
      `UPDATE schedules
          SET last_run_at = NOW(),
              last_result = CASE WHEN $2::boolean THEN NULL ELSE $3 END,
              last_error = CASE WHEN $2::boolean THEN $4 ELSE NULL END,
              updated_at = NOW()
        WHERE id = $1`,
      [id, Boolean(failed), saved, FAILED_NOTE]
    );
    if (!result.rowCount) {
      worked = false;
      why = 'schedule missing';
    }
  } catch {
    worked = false;
    why = 'could not save';
  }
  log.info(failed ? 'schedule run failed' : 'schedule run finished', {
    scheduleId: id,
    agent: agentId ? String(agentId) : null,
    runId: runId ? String(runId) : null,
    worked,
    why,
  });
}
