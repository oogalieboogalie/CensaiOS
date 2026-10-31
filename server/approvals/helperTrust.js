// Helper agents (an agent's sub-agents and agents made in the Agent Designer)
// have no Action Approvals card of their own: an approval names a family agent.
// So with Trust mode on they act like the family agents do, and with Trust
// mode off (the whole board, or the family agent they help set to "Asks
// first") the few tools that write files, merge or run commands refuse with
// words instead of running unasked.
import { agentIsTrusted } from './trustMode.js';

export const HELPER_ASKS_FIRST_TOOLS = Object.freeze(new Set([
  'project_write', 'project_edit', 'project_multi_edit', 'local_write_file', 'github_write_file',
  'submit_pr', 'merge_pr', 'sandbox_exec', 'terminal_run', 'restart_service',
]));

export class HelperNeedsTrustError extends Error {
  constructor(toolName) {
    super(`Trust mode is off, so a helper agent can't use ${toolName} on its own. `
      + 'Ask a family agent such as Atlas to do it (it asks for an OK in Action Approvals), '
      + 'or turn Trust mode on in Settings > Agents.');
    this.code = 'TOOL_APPROVAL_HELPER_NEEDS_TRUST';
    this.statusCode = 403;
  }
}

async function parentOf(db, { workspaceId, agentId }) {
  try {
    const { rows } = await db.query(
      'SELECT parent_id FROM sub_agents WHERE id = $1 AND workspace_id = $2', [agentId, workspaceId],
    );
    return rows[0]?.parent_id || null;
  } catch {
    return null;
  }
}

/**
 * Throws HelperNeedsTrustError when this helper's write or run would go unasked.
 * approvalTool: the tool has an approval module (a family agent would ask).
 */
export async function assertHelperTrusted(db, { agentId, toolName, workspaceId, approvalTool = false }) {
  const name = String(toolName || '').trim();
  if (!workspaceId) return { required: false };
  if (!HELPER_ASKS_FIRST_TOOLS.has(name) && !approvalTool) return { required: false };
  const helperId = String(agentId || '').trim().toLowerCase();
  const trusted = await agentIsTrusted(db, { workspaceId, agentId: helperId });
  const parentId = trusted ? await parentOf(db, { workspaceId, agentId }) : null;
  const parentTrusted = parentId
    ? await agentIsTrusted(db, { workspaceId, agentId: parentId })
    : true;
  if (!trusted || !parentTrusted) throw new HelperNeedsTrustError(name);
  return { required: false, trusted: true };
}
