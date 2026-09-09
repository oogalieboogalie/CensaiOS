import {
  getAgentCapabilityModule,
  toolHasApprovalModule,
} from '../../src/data/agent-capability-modules.js';
import { isCurrentToolPackageInstall } from '../capabilities/packageCatalog.js';

export async function findApprovalGrant(db, { workspaceId, agentId, toolName }) {
  if (!workspaceId || !agentId || !toolName || !toolHasApprovalModule(toolName)) return null;
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
