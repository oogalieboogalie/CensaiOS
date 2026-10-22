import pool from '../db.js';

// ═══════════════════════════════════════════════════════════════════
//  GROUP MILESTONES + GOALS
//  Each row belongs to the person who made it (owner_user_id, added by
//  docker/091-group-goal-owners.sql). Reads and changes only see your own.
//  A change returns false when there is no such row of yours.
// ═══════════════════════════════════════════════════════════════════

export async function addMilestone(userId, groupName, title, description) {
  const { rows } = await pool.query(
    'INSERT INTO group_milestones (owner_user_id, group_name, title, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, groupName, title, description || null]
  );
  return rows[0];
}

export async function getMilestones(userId, groupName) {
  const { rows } = await pool.query(
    'SELECT * FROM group_milestones WHERE owner_user_id = $1 AND group_name = $2 ORDER BY created_at DESC',
    [userId, groupName]
  );
  return rows;
}

export async function completeMilestone(userId, id) {
  const { rowCount } = await pool.query(
    'UPDATE group_milestones SET completed = TRUE, completed_at = NOW() WHERE id = $1 AND owner_user_id = $2',
    [id, userId]
  );
  return rowCount > 0;
}

export async function addGoal(userId, groupName, title, description) {
  const { rows } = await pool.query(
    'INSERT INTO group_goals (owner_user_id, group_name, title, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, groupName, title, description || null]
  );
  return rows[0];
}

export async function getGoals(userId, groupName) {
  const { rows } = await pool.query(
    'SELECT * FROM group_goals WHERE owner_user_id = $1 AND group_name = $2 ORDER BY created_at DESC',
    [userId, groupName]
  );
  return rows;
}

export async function updateGoalStatus(userId, id, status) {
  const { rowCount } = await pool.query(
    'UPDATE group_goals SET status = $1 WHERE id = $2 AND owner_user_id = $3',
    [status, id, userId]
  );
  return rowCount > 0;
}
