import pool from '../db.js';

export async function getAutonomyOwnershipSummary({ db = pool } = {}) {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*)::int FROM agent_messages
        WHERE workspace_id IS NULL OR created_by_user_id IS NULL) AS legacy_message_count,
      (SELECT count(*)::int FROM agent_tasks
        WHERE workspace_id IS NULL OR created_by_user_id IS NULL) AS legacy_task_count,
      (SELECT count(*)::int FROM agent_tasks
        WHERE status IN ('queued', 'in_progress', 'blocked')
          AND (workspace_id IS NULL OR created_by_user_id IS NULL)) AS blocking_task_count,
      (SELECT count(*)::int FROM agent_wakeups aw
        JOIN agent_messages am ON am.id=aw.message_id
        WHERE aw.status IN ('queued', 'in_progress', 'waiting_children')
          AND (am.workspace_id IS NULL OR am.created_by_user_id IS NULL)) AS blocking_wakeup_count
  `);
  const row = rows[0] || {};
  const blockingTaskCount = row.blocking_task_count || 0;
  const blockingWakeupCount = row.blocking_wakeup_count || 0;
  return {
    ready: blockingTaskCount === 0 && blockingWakeupCount === 0,
    legacyMessageCount: row.legacy_message_count || 0,
    legacyTaskCount: row.legacy_task_count || 0,
    blockingTaskCount,
    blockingWakeupCount,
  };
}
