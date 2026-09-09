import { FAMILY_AGENT_BY_ID } from '../../src/data/family-agents.js';
import {
  AGENT_CAPABILITY_MODULES,
  getAgentCapabilityModule,
} from '../../src/data/agent-capability-modules.js';
import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { cancelRemovedModuleApprovals } from '../approvals/cancellations.js';
import { isCurrentToolPackageInstall } from './packageCatalog.js';
import { assertToolPackagesInstalled, lockToolPackages } from './packageStore.js';

export class WorkspaceCapabilityError extends Error {
  constructor(message, statusCode = 400, code = 'WORKSPACE_CAPABILITY_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function canonicalAgentId(value) {
  const agentId = String(value || '').trim().toLowerCase();
  if (!FAMILY_AGENT_BY_ID[agentId]) {
    throw new WorkspaceCapabilityError(
      'Only canonical family agents can equip modules in private beta.',
      422,
      'WORKSPACE_CAPABILITY_UNSUPPORTED_AGENT',
    );
  }
  return agentId;
}

export function validateCapabilityModuleIds(moduleIds) {
  if (!Array.isArray(moduleIds)) {
    throw new WorkspaceCapabilityError('Modules must be an array of IDs.');
  }
  if (moduleIds.length > 4) throw new WorkspaceCapabilityError('At most four modules can be equipped.');
  const ids = moduleIds.map(value => typeof value === 'string' ? value.trim() : '');
  if (ids.some(id => !id)) throw new WorkspaceCapabilityError('Every module ID must be a non-empty string.');
  if (new Set(ids).size !== ids.length) throw new WorkspaceCapabilityError('Module IDs must be unique.');
  const modules = ids.map(id => getAgentCapabilityModule(id));
  const missing = ids.filter((id, index) => !modules[index]);
  if (missing.length) throw new WorkspaceCapabilityError(`Unknown module IDs: ${missing.join(', ')}`);
  if (new Set(modules.map(module => module.slot)).size !== modules.length) {
    throw new WorkspaceCapabilityError('Only one module can occupy each slot.');
  }
  return modules;
}

export function validateCapabilityModuleCatalog(toolCatalog) {
  const tools = new Map(toolCatalog.map(tool => [tool.name, tool]));
  const errors = [];
  for (const module of AGENT_CAPABILITY_MODULES) {
    const validMode = (module.risk === 'read' && module.mode === 'autonomous')
      || (module.risk === 'write' && module.mode === 'execute_with_approval');
    if (!validMode) errors.push(`${module.id}: invalid ${module.risk}/${module.mode} contract`);
    for (const name of module.toolNames) {
      const tool = tools.get(name);
      if (!tool) errors.push(`${module.id}: missing ${name}`);
      else if (tool.risk !== module.risk) errors.push(`${module.id}: ${name} is ${tool.risk}`);
    }
  }
  return errors;
}

export async function listWorkspaceCapabilityModules(db, { workspaceId, agentId }) {
  const canonicalId = canonicalAgentId(agentId);
  const { rows } = await db.query(
    `SELECT c.module_id,c.capability_id,c.mode,c.equipped_slot,c.source,
      c.equipped_by_user_id,c.updated_at,p.package_id,p.package_version,p.manifest_hash
       FROM workspace_agent_capabilities c
       LEFT JOIN workspace_tool_package_installs p
         ON p.workspace_id=c.workspace_id AND p.module_id=c.module_id
      WHERE c.workspace_id=$1 AND c.agent_id=$2 ORDER BY c.equipped_slot,c.module_id`,
    [workspaceId, canonicalId],
  );
  return rows.filter(row => isCurrentToolPackageInstall(row, row.module_id));
}

export async function loadWorkspaceCapabilityToolNames(db, { workspaceId, agentId }) {
  if (!String(workspaceId || '').trim()) return [];
  const rows = await listWorkspaceCapabilityModules(db, { workspaceId, agentId });
  return [...new Set(rows.flatMap(row => {
    const module = getAgentCapabilityModule(row.module_id);
    if (!module || module.capabilityId !== row.capability_id
      || module.mode !== row.mode || module.slot !== row.equipped_slot) return [];
    return module.toolNames;
  }))];
}

function sameSelection(rows, modules) {
  const current = rows.map(row => row.module_id).sort();
  const next = modules.map(module => module.id).sort();
  return current.length === next.length && current.every((id, index) => id === next[index]);
}

export async function replaceWorkspaceCapabilityModules(db, {
  workspaceId, userId, agentId, moduleIds,
}) {
  const canonicalId = canonicalAgentId(agentId);
  const modules = validateCapabilityModuleIds(moduleIds);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `workspace-capabilities:${workspaceId}:${canonicalId}`,
    ]);
    await lockToolPackages(client, workspaceId, modules);
    await assertToolPackagesInstalled(client, workspaceId, modules);
    const current = await listWorkspaceCapabilityModules(client, { workspaceId, agentId: canonicalId });
    if (sameSelection(current, modules)) {
      await client.query('COMMIT');
      return { changed: false, eventId: null, capabilities: current };
    }
    await client.query(
      'DELETE FROM workspace_agent_capabilities WHERE workspace_id=$1 AND agent_id=$2',
      [workspaceId, canonicalId],
    );
    if (modules.length) await client.query(
      `INSERT INTO workspace_agent_capabilities
        (workspace_id,agent_id,module_id,capability_id,mode,equipped_slot,source,equipped_by_user_id)
       SELECT $1,$2,input.module_id,input.capability_id,input.mode,input.slot,'exoskeleton',$7
         FROM unnest($3::text[],$4::text[],$5::text[],$6::text[])
           AS input(module_id,capability_id,mode,slot)`,
      [workspaceId, canonicalId, modules.map(m => m.id), modules.map(m => m.capabilityId),
        modules.map(m => m.mode), modules.map(m => m.slot), userId],
    );
    const cancelledApprovals = await cancelRemovedModuleApprovals(client, {
      workspaceId, agentId: canonicalId, keptModuleIds: modules.map(module => module.id), userId,
    });
    const event = await createWorkspaceEvent({ db: client }, {
      workspaceId,
      type: 'agent.capability_modules.replaced',
      actor: { kind: 'user', id: String(userId) },
      payload: {
        agentId: canonicalId,
        moduleIds: modules.map(module => module.id),
        cancelledApprovalCount: cancelledApprovals.length,
      },
    });
    const capabilities = await listWorkspaceCapabilityModules(client, { workspaceId, agentId: canonicalId });
    await client.query('COMMIT');
    return { changed: true, eventId: event.id, capabilities };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
