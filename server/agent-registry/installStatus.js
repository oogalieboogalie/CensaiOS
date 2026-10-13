import pool from '../db.js';

export async function getAgentCardInstallOwnershipSummary(db = pool) {
  const { rows: [row] } = await db.query(`SELECT count(*)::int AS total_count,
    count(DISTINCT workspace_id)::int AS workspace_count,
    count(DISTINCT card_id)::int AS card_count FROM workspace_agent_card_installs`);
  return {
    ready: true,
    totalCount: row?.total_count || 0,
    workspaceCount: row?.workspace_count || 0,
    cardCount: row?.card_count || 0,
  };
}
