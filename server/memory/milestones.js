import pool from '../db.js';

// ═══════════════════════════════════════════════════════════════════
//  GROUP MILESTONES + GOALS
// ═══════════════════════════════════════════════════════════════════

export async function addMilestone(groupName, title, description) {
  const { rows } = await pool.query(
    'INSERT INTO group_milestones (group_name, title, description) VALUES ($1, $2, $3) RETURNING *',
    [groupName, title, description || null]
  );
  return rows[0];
}

export async function getMilestones(groupName) {
  const { rows } = await pool.query(
    'SELECT * FROM group_milestones WHERE group_name = $1 ORDER BY created_at DESC',
    [groupName]
  );
  return rows;
}

export async function completeMilestone(id) {
  await pool.query(
    'UPDATE group_milestones SET completed = TRUE, completed_at = NOW() WHERE id = $1',
    [id]
  );
}

export async function addGoal(groupName, title, description) {
  const { rows } = await pool.query(
    'INSERT INTO group_goals (group_name, title, description) VALUES ($1, $2, $3) RETURNING *',
    [groupName, title, description || null]
  );
  return rows[0];
}

export async function getGoals(groupName) {
  const { rows } = await pool.query(
    'SELECT * FROM group_goals WHERE group_name = $1 ORDER BY created_at DESC',
    [groupName]
  );
  return rows;
}

export async function updateGoalStatus(id, status) {
  await pool.query(
    'UPDATE group_goals SET status = $1 WHERE id = $2',
    [status, id]
  );
}
