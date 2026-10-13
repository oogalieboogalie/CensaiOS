import { createWorkspaceEvent } from '../operational-intelligence/factories.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import {
  REVIEWED_TOOL_PACKAGES,
  getReviewedToolPackage,
  isCurrentToolPackageInstall,
  toolPackageLockKey,
} from './packageCatalog.js';

export class ToolPackageError extends Error {
  constructor(message, statusCode = 400, code = 'TOOL_PACKAGE_INVALID') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function reviewed(packageId) {
  const pkg = getReviewedToolPackage(packageId);
  if (!pkg) throw new ToolPackageError('Reviewed tool package not found.', 404, 'TOOL_PACKAGE_NOT_FOUND');
  return pkg;
}

async function packageRows(db, workspaceId) {
  const { rows } = await db.query(`SELECT workspace_id,package_id,module_id,package_version,
    manifest_hash,installed_by_user_id,installed_at FROM workspace_tool_package_installs
    WHERE workspace_id=$1 ORDER BY installed_at,package_id`, [workspaceId]);
  return rows;
}

export async function listWorkspaceToolPackages(db, { workspaceId, userId }) {
  const workspace = await requireWorkspaceMember(db, { workspaceId, userId });
  const rows = await packageRows(db, workspaceId);
  const installs = new Map(rows.filter(row => isCurrentToolPackageInstall(row))
    .map(row => [row.package_id, row]));
  return {
    canManage: ['owner', 'admin'].includes(workspace.role),
    packages: REVIEWED_TOOL_PACKAGES.map(pkg => ({
      ...pkg,
      installed: installs.has(pkg.id),
      install: installs.get(pkg.id) || null,
    })),
    invalidInstallCount: rows.filter(row => !isCurrentToolPackageInstall(row)).length,
  };
}

export async function loadInstalledToolPackageModuleIds(db, workspaceId) {
  return (await packageRows(db, workspaceId))
    .filter(row => isCurrentToolPackageInstall(row))
    .map(row => row.module_id);
}

export async function assertToolPackagesInstalled(db, workspaceId, modules) {
  const installed = new Set(await loadInstalledToolPackageModuleIds(db, workspaceId));
  const missing = modules.filter(module => !installed.has(module.id));
  if (missing.length) throw new ToolPackageError(
    `Install these reviewed add-ons before equipping them: ${missing.map(module => module.name).join(', ')}.`,
    409, 'TOOL_PACKAGE_NOT_INSTALLED',
  );
}

export async function lockToolPackages(db, workspaceId, modules) {
  const keys = modules.map(module => toolPackageLockKey(workspaceId, module.id)).filter(Boolean).sort();
  for (const key of keys) {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
  }
}

async function packageEvent(db, { workspaceId, userId, type, pkg, payload = {} }) {
  return createWorkspaceEvent({ db }, {
    workspaceId, type, actor: { kind: 'user', id: String(userId) },
    payload: { packageId: pkg.id, moduleId: pkg.module.id, version: pkg.version, ...payload },
  });
}

export async function installWorkspaceToolPackage(db, { workspaceId, userId, packageId }) {
  const pkg = reviewed(packageId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await requireWorkspaceMember(client, { workspaceId, userId, roles: ['owner', 'admin'] });
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [toolPackageLockKey(workspaceId, pkg.module.id)]);
    const { rows: [current] } = await client.query(`SELECT * FROM workspace_tool_package_installs
      WHERE workspace_id=$1 AND package_id=$2 FOR UPDATE`, [workspaceId, pkg.id]);
    if (current && !isCurrentToolPackageInstall(current)) {
      throw new ToolPackageError('Installed package metadata does not match the reviewed manifest.', 409,
        'TOOL_PACKAGE_MANIFEST_DRIFT');
    }
    if (current) {
      await client.query('COMMIT');
      return { created: false, install: current, eventId: null };
    }
    const { rows: [install] } = await client.query(`INSERT INTO workspace_tool_package_installs
      (workspace_id,package_id,module_id,package_version,manifest_hash,installed_by_user_id)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [workspaceId, pkg.id, pkg.module.id, pkg.version, pkg.manifestHash, userId]);
    const event = await packageEvent(client, {
      workspaceId, userId, type: 'agent.tool_package.installed', pkg,
    });
    await client.query('COMMIT');
    return { created: true, install, eventId: event.id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function removeWorkspaceToolPackage(db, { workspaceId, userId, packageId }) {
  const pkg = reviewed(packageId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await requireWorkspaceMember(client, { workspaceId, userId, roles: ['owner', 'admin'] });
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [toolPackageLockKey(workspaceId, pkg.module.id)]);
    const { rows: [current] } = await client.query(`SELECT * FROM workspace_tool_package_installs
      WHERE workspace_id=$1 AND package_id=$2 FOR UPDATE`, [workspaceId, pkg.id]);
    if (!current) {
      await client.query('COMMIT');
      return { removed: false, eventId: null, affectedAgents: [], cancelledApprovals: 0 };
    }
    const { rows: [busy] } = await client.query(`SELECT count(*)::int AS count
      FROM workspace_tool_approvals WHERE workspace_id=$1 AND module_id=$2 AND status='executing'`,
    [workspaceId, pkg.module.id]);
    if (busy.count) throw new ToolPackageError('This add-on has an action currently executing.', 409,
      'TOOL_PACKAGE_EXECUTION_IN_PROGRESS');
    const { rows: capabilities } = await client.query(`DELETE FROM workspace_agent_capabilities
      WHERE workspace_id=$1 AND module_id=$2 RETURNING agent_id`, [workspaceId, pkg.module.id]);
    const { rows: approvals } = await client.query(`UPDATE workspace_tool_approvals SET
      status='cancelled',revision=revision+1,cancellation_reason='package_removed',updated_at=NOW()
      WHERE workspace_id=$1 AND module_id=$2 AND status='pending' RETURNING id,agent_id,tool_name`,
    [workspaceId, pkg.module.id]);
    await client.query('DELETE FROM workspace_tool_package_installs WHERE workspace_id=$1 AND package_id=$2',
      [workspaceId, pkg.id]);
    const affectedAgents = [...new Set(capabilities.map(row => row.agent_id))];
    const event = await packageEvent(client, {
      workspaceId, userId, type: 'agent.tool_package.removed', pkg,
      payload: { affectedAgents, cancelledApprovalCount: approvals.length },
    });
    await client.query('COMMIT');
    return { removed: true, eventId: event.id, affectedAgents, cancelledApprovals: approvals.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
