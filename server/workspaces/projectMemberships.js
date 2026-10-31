import { classifyAgentIdentity } from '../agents/identity.js';

const PERMISSIONS = new Set(['read', 'work']);
const MAX_MEMBERSHIPS = 64;

export class ProjectMembershipError extends Error {
  constructor(message, { code = 'INVALID_PROJECT_MEMBERSHIP', statusCode = 400, readOnly = false } = {}) {
    super(message);
    this.name = 'ProjectMembershipError';
    this.code = code;
    this.statusCode = statusCode;
    // The agent may read the project here but was asked to change it.
    if (readOnly) this.readOnly = true;
  }
}

function requiredText(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new ProjectMembershipError(`${label} is required.`);
  return result;
}

function normalizeMemberships(input) {
  if (!Array.isArray(input)) throw new ProjectMembershipError('memberships must be an array.');
  if (input.length > MAX_MEMBERSHIPS) {
    throw new ProjectMembershipError(`memberships cannot contain more than ${MAX_MEMBERSHIPS} entries.`);
  }
  const rows = input.map((entry) => {
    const agentId = requiredText(entry?.agentId, 'agentId');
    const permission = String(entry?.permission || 'work').trim();
    if (!PERMISSIONS.has(permission)) {
      throw new ProjectMembershipError(`Unsupported project permission: ${permission}`);
    }
    return { agentId, permission };
  });
  if (new Set(rows.map((row) => row.agentId)).size !== rows.length) {
    throw new ProjectMembershipError('Agent memberships must be unique.');
  }
  return rows;
}

export async function listWorkspaceAgentProjects(db, { workspaceId, agentId = null }) {
  const params = [requiredText(workspaceId, 'workspaceId')];
  const agentFilter = agentId ? `AND wap.agent_id = $${params.push(requiredText(agentId, 'agentId'))}` : '';
  const { rows } = await db.query(
    `SELECT wap.workspace_id, wap.project_id, wap.agent_id, wap.permission,
            wap.source_kind, wap.source_id, wap.updated_at, wap.last_prewarmed_at,
            p.name AS project_name, p.path AS project_path, p.repo AS project_repo,
            p.summary AS project_summary
       FROM workspace_agent_projects wap
       JOIN projects p ON p.id = wap.project_id
      WHERE wap.workspace_id = $1 ${agentFilter}
      ORDER BY wap.updated_at DESC, wap.project_id, wap.agent_id`,
    params
  );
  return rows;
}

/**
 * A board's own agents (a starter board's Lead, Researcher and so on) live in
 * sub_agents and reach project files through their parent's membership. A
 * chat window for one of them stands for its parent here; before this, one
 * such window made the whole board's project sync fail, so no agent on the
 * board could open a file.
 */
async function boardAgentsAsParents(db, workspaceId, rows) {
  const { rows: subs } = await db.query(
    'SELECT id, parent_id FROM sub_agents WHERE workspace_id = $1 AND id = ANY($2)',
    [workspaceId, rows.map((row) => row.agentId)]
  );
  const parentOf = new Map(subs.filter((sub) => sub.parent_id).map((sub) => [sub.id, sub.parent_id]));
  const merged = new Map();
  for (const row of rows) {
    const agentId = parentOf.get(row.agentId) || row.agentId;
    const before = merged.get(agentId);
    merged.set(agentId, { agentId, permission: before?.permission === 'work' ? 'work' : row.permission });
  }
  return [...merged.values()];
}

export async function replaceCanvasProjectMemberships(db, {
  workspaceId,
  projectId,
  memberships,
  sourceId = null,
  userId = null,
}) {
  const cleanWorkspaceId = requiredText(workspaceId, 'workspaceId');
  const cleanProjectId = requiredText(projectId, 'projectId');
  let rows = normalizeMemberships(memberships);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const project = await client.query('SELECT id FROM projects WHERE id = $1', [cleanProjectId]);
    if (!project.rows[0]) throw new ProjectMembershipError('Project not found.', { statusCode: 404 });

    if (rows.length > 0) {
      rows = await boardAgentsAsParents(client, cleanWorkspaceId, rows);
      const agents = await client.query('SELECT * FROM agents WHERE id = ANY($1)', [rows.map((row) => row.agentId)]);
      const canonical = new Set(agents.rows
        .filter((agent) => classifyAgentIdentity(agent).betaVisible)
        .map((agent) => agent.id));
      const invalid = rows.map((row) => row.agentId).filter((id) => !canonical.has(id));
      if (invalid.length > 0) {
        throw new ProjectMembershipError(`Unknown or non-canonical agent IDs: ${invalid.join(', ')}`);
      }
    }

    await client.query(
      `DELETE FROM workspace_agent_projects
        WHERE workspace_id = $1 AND source_kind = 'canvas'
          AND (project_id <> $2 OR NOT (agent_id = ANY($3::text[])))`,
      [cleanWorkspaceId, cleanProjectId, rows.map((row) => row.agentId)]
    );
    for (const row of rows) {
      await client.query(
        `INSERT INTO workspace_agent_projects
         (workspace_id, project_id, agent_id, permission, source_kind, source_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, 'canvas', $5, $6)
         ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE SET
           permission = EXCLUDED.permission,
           source_id = EXCLUDED.source_id,
           created_by_user_id = EXCLUDED.created_by_user_id,
           updated_at = NOW()`,
        [cleanWorkspaceId, cleanProjectId, row.agentId, row.permission, sourceId, userId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return listWorkspaceAgentProjects(db, { workspaceId: cleanWorkspaceId });
}

export async function assertAgentProjectAccess(db, {
  workspaceId,
  projectId,
  agentId,
  requiredPermission = 'read',
}) {
  const { rows } = await db.query(
    `SELECT permission FROM workspace_agent_projects
      WHERE workspace_id = $1 AND project_id = $2 AND agent_id = $3
      ORDER BY CASE permission WHEN 'work' THEN 0 ELSE 1 END
      LIMIT 1`,
    [workspaceId, projectId, agentId]
  );
  const permission = rows[0]?.permission;
  const allowed = permission === 'work' || (permission === 'read' && requiredPermission === 'read');
  if (!allowed) {
    // Read-only only when the board gave it to read: a project it was not given at all is not read-only.
    const readOnly = permission === 'read';
    throw new ProjectMembershipError(
      readOnly
        ? 'This agent has read-only project access in the current workspace.'
        : 'This agent is not authorized for that project in the current workspace.',
      { code: 'PROJECT_ACCESS_DENIED', statusCode: 403, readOnly }
    );
  }
  return { workspaceId, projectId, agentId, permission };
}

export async function assertAgentRepoAccess(db, {
  workspaceId,
  repo,
  agentId,
  requiredPermission = 'read',
}) {
  const { rows } = await db.query(
    `SELECT wap.project_id
       FROM workspace_agent_projects wap
       JOIN projects p ON p.id = wap.project_id
      WHERE wap.workspace_id = $1 AND wap.agent_id = $2 AND p.repo = $3
      ORDER BY CASE wap.permission WHEN 'work' THEN 0 ELSE 1 END
      LIMIT 1`,
    [workspaceId, agentId, repo]
  );
  if (!rows[0]) {
    throw new ProjectMembershipError(
      'This agent is not authorized for that repository in the current workspace.',
      { code: 'PROJECT_ACCESS_DENIED', statusCode: 403 }
    );
  }
  return assertAgentProjectAccess(db, {
    workspaceId,
    projectId: rows[0].project_id,
    agentId,
    requiredPermission,
  });
}

export async function grantManualProjectMembership(db, {
  workspaceId,
  projectId,
  agentId,
  userId,
  permission = 'work',
}) {
  if (!PERMISSIONS.has(permission)) throw new ProjectMembershipError(`Unsupported project permission: ${permission}`);
  await db.query(
    `INSERT INTO workspace_agent_projects
      (workspace_id, project_id, agent_id, permission, source_kind, source_id, created_by_user_id)
     VALUES ($1, $2, $3, $4, 'manual', 'open_project', $5)
     ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE
       SET permission = EXCLUDED.permission, source_id = EXCLUDED.source_id,
           created_by_user_id = EXCLUDED.created_by_user_id, updated_at = NOW()`,
    [workspaceId, projectId, agentId, permission, userId]
  );
}

export async function markProjectContextPrewarmed(db, { workspaceId, projectId, agentId }) {
  await db.query(
    `UPDATE workspace_agent_projects SET last_prewarmed_at = NOW(), updated_at = NOW()
      WHERE workspace_id = $1 AND project_id = $2 AND agent_id = $3`,
    [workspaceId, projectId, agentId]
  );
}
