import pool from '../../db.js';

export async function getAgents() {
  const { rows } = await pool.query('SELECT * FROM agents ORDER BY created_at');
  return rows;
}

export async function getAgent(id) {
  const { rows } = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function getAgentsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const { rows } = await pool.query('SELECT * FROM agents WHERE id = ANY($1)', [ids]);
  return rows;
}

export async function upsertAgent(agent) {
  const toolScopes = agent.tool_scopes ?? agent.toolScopes ?? {};
  const { rows } = await pool.query(
    `INSERT INTO agents (id, name, role, glyph, kind, hue, personality, specialty, system_prompt, model_provider, model_name, tool_scopes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, role = EXCLUDED.role, glyph = EXCLUDED.glyph,
       kind = EXCLUDED.kind, hue = EXCLUDED.hue, personality = EXCLUDED.personality,
       specialty = EXCLUDED.specialty, system_prompt = EXCLUDED.system_prompt,
       model_provider = EXCLUDED.model_provider, model_name = EXCLUDED.model_name,
       tool_scopes = EXCLUDED.tool_scopes,
       updated_at = NOW()
     RETURNING *`,
    [agent.id, agent.name, agent.role, agent.glyph || 'A', agent.kind || 'ai',
     agent.hue || 0, agent.personality, agent.specialty, agent.system_prompt,
     agent.model_provider, agent.model_name, JSON.stringify(toolScopes)]
  );
  return rows[0];
}
