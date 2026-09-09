const AGENT_KEYWORDS = {
  censai: /\b(censai|censi)\b/i,
  genesis: /\b(genesis)\b/i,
  atlas: /\b(atlas)\b/i,
  nexus: /\b(nexus)\b/i,
  echo: /\b(echo)\b/i,
  architect: /\b(architect)\b/i,
  foundation: /\b(foundation)\b/i,
  guardian: /\b(guardian)\b/i
};

export function extractMentionedAgents(text) {
  const mentioned = [];
  for (const [agentId, regex] of Object.entries(AGENT_KEYWORDS)) {
    if (regex.test(text)) {
      mentioned.push(agentId);
    }
  }
  return mentioned;
}

export async function checkMemberMemory(pool, agentId, eventDescription, workspaceId) {
  const keywords = eventDescription
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 4);
  
  if (keywords.length === 0) return false;

  const searchClauses = keywords.map((_, idx) => `content ILIKE $${idx + 3}`);
  const sql = `
    SELECT id FROM memories 
    WHERE agent_id = $1 AND workspace_id = $2
      AND (${searchClauses.join(' OR ')})
    LIMIT 1
  `;
  
  const { rows } = await pool.query(sql, [agentId, workspaceId, ...keywords.map(k => `%${k}%`)]);
  return rows.length > 0;
}
