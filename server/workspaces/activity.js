import pool from '../db.js';

export async function logProjectActivity(projectId, agentId, action, detail) {
  try {
    await pool.query(
      'INSERT INTO project_activity (project_id, agent_id, action, detail) VALUES ($1, $2, $3, $4)',
      [projectId, agentId, action, detail || null]
    );
  } catch {}
}

export async function getRecentActivity(projectId, limit = 10) {
  try {
    const { rows } = await pool.query(
      'SELECT agent_id, action, detail, created_at FROM project_activity WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
      [projectId, limit]
    );
    return rows;
  } catch {
    return [];
  }
}
