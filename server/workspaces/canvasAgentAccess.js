import { classifyAgentIdentity } from '../agents/identity.js';

// Family agents are always eligible. A custom agent is eligible only when the
// person saving the board is that workspace's owner. Other roles keep the
// family-only list. Development and duplicate rows stay ineligible for everyone.
export function canvasAgentAllowed(agent, { allowCustom = false } = {}) {
  const identity = classifyAgentIdentity(agent);
  if (identity.betaVisible) return true;
  return allowCustom === true && identity.class === 'unregistered';
}

export function invalidCanvasAgentIds(requestedIds, agents, { allowCustom = false } = {}) {
  const allowed = new Set(
    agents
      .filter((agent) => canvasAgentAllowed(agent, { allowCustom }))
      .map((agent) => agent.id),
  );
  return requestedIds.filter((id) => !allowed.has(id));
}

export async function ownerMayAuthorizeCustomAgents(db, { workspaceId, userId }) {
  if (userId == null || userId === '') return false;
  const { rows } = await db.query(
    'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId],
  );
  return rows[0]?.role === 'owner';
}
