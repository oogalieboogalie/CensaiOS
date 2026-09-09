import pool from '../db.js';

export async function claimTask() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      SELECT id FROM agent_tasks
      WHERE status = 'queued'
        AND workspace_id IS NOT NULL AND created_by_user_id IS NOT NULL
      ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    const taskId = rows[0].id;
    await client.query(
      `UPDATE agent_tasks SET status='in_progress', started_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [taskId]
    );
    await client.query('COMMIT');
    const { rows: tasks } = await pool.query('SELECT * FROM agent_tasks WHERE id=$1', [taskId]);
    return tasks[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
