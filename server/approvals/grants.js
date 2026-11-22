import {
  AGENT_CAPABILITY_MODULES,
  getAgentCapabilityModule,
  toolHasApprovalModule,
} from '../../src/data/agent-capability-modules.js';
import { isCurrentToolPackageInstall } from '../capabilities/packageCatalog.js';
import { familyAsksFirst, familyToolPolicy } from '../tools/rbac/familyBaseline.js';

// Approvals for a role tool that no module names are filed under this id.
export const ROLE_MODULE_ID = 'role';

// A tool the agent has as part of its role needs nothing equipped: Trust mode
// alone decides if a call waits. Its approvals are filed under the module
// that names the tool, or under "role" when none does.
function roleGrant(agentId, toolName) {
  if (!familyToolPolicy(agentId, toolName)) return null;
  const module = AGENT_CAPABILITY_MODULES.find((entry) => (
    entry.mode === 'execute_with_approval' && entry.toolNames.includes(toolName)
  ));
  if (module) return { moduleId: module.id, capabilityId: module.capabilityId, mode: module.mode };
  return familyAsksFirst(agentId, toolName)
    ? { moduleId: ROLE_MODULE_ID, capabilityId: `role.${toolName}`, mode: 'execute_with_approval' }
    : null;
}

/** Module ids whose approvals stay when this agent's modules change: what it has by role. */
export function roleModuleIds(agentId) {
  const id = String(agentId || '').toLowerCase();
  return [ROLE_MODULE_ID, ...AGENT_CAPABILITY_MODULES
    .filter((entry) => entry.toolNames.some((toolName) => familyToolPolicy(id, toolName)))
    .map((entry) => entry.id)];
}

export async function findApprovalGrant(db, { workspaceId, agentId, toolName }) {
  if (!workspaceId || !agentId || !toolName) return null;
  const byRole = roleGrant(String(agentId).toLowerCase(), toolName);
  if (byRole) return byRole;
  if (!toolHasApprovalModule(toolName)) return null;
  const { rows } = await db.query(
    `SELECT c.module_id,c.capability_id,c.mode,c.equipped_slot,
      p.package_id,p.package_version,p.manifest_hash
       FROM workspace_agent_capabilities c
       LEFT JOIN workspace_tool_package_installs p
         ON p.workspace_id=c.workspace_id AND p.module_id=c.module_id
      WHERE c.workspace_id=$1 AND c.agent_id=$2 AND c.mode='execute_with_approval'`,
    [workspaceId, String(agentId).toLowerCase()],
  );
  for (const row of rows) {
    const module = getAgentCapabilityModule(row.module_id);
    if (!module || module.mode !== row.mode || module.capabilityId !== row.capability_id
      || module.slot !== row.equipped_slot || !module.toolNames.includes(toolName)
      || !isCurrentToolPackageInstall(row, module.id)) continue;
    return { moduleId: module.id, capabilityId: module.capabilityId, mode: module.mode };
  }
  return null;
}
