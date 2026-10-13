import pool from '../db.js';

// Agent traits can be read; trait evolution is not part of the open source build.
export async function getGenetics(agentId) {
  const { rows } = await pool.query('SELECT * FROM family_genetics WHERE agent_id = $1', [agentId]);
  return rows[0] || null;
}

export async function evolveTraits() {}
