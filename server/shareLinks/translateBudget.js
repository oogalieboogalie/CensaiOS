// Claim a share link's agent budget in one update. The check and the charge
// are the same statement, so a burst cannot all see the budget as unspent.

export async function reserveAgentBudget(db, linkId, tokens) {
  const spent = Math.max(1, Math.ceil(Number(tokens) || 0));
  const { rows } = await db.query(
    `UPDATE share_links
        SET agent_tokens_used = agent_tokens_used + $2
      WHERE id::text = $1
        AND agent_tokens_used + $2 <= agent_budget_tokens
      RETURNING agent_budget_tokens, agent_tokens_used`,
    [String(linkId), spent],
  );
  return rows[0] || null;
}

export async function releaseAgentBudget(db, linkId, tokens) {
  const give = Math.max(0, Math.ceil(Number(tokens) || 0));
  if (!give) return null;
  const { rows } = await db.query(
    `UPDATE share_links
        SET agent_tokens_used = GREATEST(0, agent_tokens_used - $2)
      WHERE id::text = $1
      RETURNING agent_budget_tokens, agent_tokens_used`,
    [String(linkId), give],
  );
  return rows[0] || null;
}
