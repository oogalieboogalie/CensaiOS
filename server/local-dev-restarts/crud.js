import pool from '../db.js';
import { ensureLocalDevRestartsTable } from './table.js';

export async function createLocalDevRestart({ initiatedBy, reason, windowId, noticeSeconds = 5 }) {
  await ensureLocalDevRestartsTable();
  const { rows } = await pool.query(
    `INSERT INTO local_dev_restarts (initiated_by, reason, window_id, notice_seconds)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [initiatedBy, reason || null, windowId || null, noticeSeconds]
  );
  return rows[0];
}

export async function getPendingLocalDevRestartNotifications({ windowId, agentId }) {
  await ensureLocalDevRestartsTable();
  const params = [];
  const where = [
    "status = 'completed'",
    'delivered_at IS NULL',
    'completion_message IS NOT NULL',
  ];

  if (windowId) {
    params.push(windowId);
    where.push(`window_id = $${params.length}`);
  } else if (agentId) {
    params.push(agentId);
    where.push(`initiated_by = $${params.length}`);
  } else {
    return [];
  }

  const { rows } = await pool.query(
    `UPDATE local_dev_restarts
     SET delivered_at = NOW()
     WHERE id IN (
       SELECT id FROM local_dev_restarts
       WHERE ${where.join(' AND ')}
       ORDER BY restart_completed_at DESC
       LIMIT 5
     )
     RETURNING id, initiated_by, reason, requested_at, restart_started_at,
       restart_completed_at, completion_message`,
    params
  );
  return rows;
}
