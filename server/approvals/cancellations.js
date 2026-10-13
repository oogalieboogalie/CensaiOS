import { createWorkspaceEvent } from '../operational-intelligence/factories.js';

export async function cancelRemovedModuleApprovals(db, {
  workspaceId, agentId, keptModuleIds, userId,
}) {
  const { rows } = await db.query(`UPDATE workspace_tool_approvals SET
    status='cancelled',revision=revision+1,cancellation_reason='module_removed',updated_at=NOW()
    WHERE workspace_id=$1 AND agent_id=$2 AND status='pending'
      AND NOT (module_id=ANY($3::text[])) RETURNING id,module_id,tool_name`,
  [workspaceId, agentId, keptModuleIds]);
  if (rows.length) await createWorkspaceEvent({ db }, {
    workspaceId, type: 'agent.tool_approval.cancelled', actor: { kind: 'user', id: String(userId) },
    payload: { agentId, reason: 'module_removed', approvals: rows },
  });
  return rows;
}
