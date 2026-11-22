import {
  invalidCanvasAgentIds,
  ownerMayAuthorizeCustomAgents,
} from './canvasAgentAccess.js';
import {
  PERMISSIONS,
  ProjectMembershipError,
  normalizeMemberships,
  normalizeWindowProjects,
  requiredText,
} from './membershipInput.js';

export { ProjectMembershipError };

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

/**
 * One save of a board: the board's main project for every agent on it, plus
 * each window's own project for the agent in that window. Every other
 * project the board gave before is taken back. Rows given another way
 * (by hand, or a hand-off's) are never touched.
 */
export async function replaceCanvasProjectMemberships(db, {
  workspaceId,
  projectId,
  memberships,
  windowProjects = [],
  sourceId = null,
  userId = null,
}) {
  const cleanWorkspaceId = requiredText(workspaceId, 'workspaceId');
  const cleanProjectId = requiredText(projectId, 'projectId');
  let rows = normalizeMemberships(memberships);
  let windows = normalizeWindowProjects(windowProjects, cleanProjectId);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const project = await client.query('SELECT id FROM projects WHERE id = $1', [cleanProjectId]);
    if (!project.rows[0]) throw new ProjectMembershipError('Project not found.', { statusCode: 404 });
    if (windows.length > 0) {
      // A window may still name a project that has since been removed: it
      // gives nothing, and the rest of the board still saves.
      const known = await client.query('SELECT id FROM projects WHERE id = ANY($1)', [windows.map((w) => w.projectId)]);
      const knownIds = new Set(known.rows.map((row) => row.id));
      windows = windows.filter((w) => knownIds.has(w.projectId) && w.rows.length > 0);
    }

    if (rows.length > 0 || windows.length > 0) {
      rows = await boardAgentsAsParents(client, cleanWorkspaceId, rows);
      for (const w of windows) w.rows = await boardAgentsAsParents(client, cleanWorkspaceId, w.rows);
      const agentIds = [...new Set([...rows, ...windows.flatMap((w) => w.rows)].map((row) => row.agentId))];
      const agents = await client.query('SELECT * FROM agents WHERE id = ANY($1)', [agentIds]);
      const allowCustom = await ownerMayAuthorizeCustomAgents(client, {
        workspaceId: cleanWorkspaceId,
        userId,
      });
      const invalid = invalidCanvasAgentIds(agentIds, agents.rows, { allowCustom });
      if (invalid.length > 0) {
        throw new ProjectMembershipError(`Unknown or non-canonical agent IDs: ${invalid.join(', ')}`);
      }
    }

    const kept = windows.flatMap((w) => w.rows.map((row) => [w.projectId, row.agentId]));
    await client.query(
      `DELETE FROM workspace_agent_projects
        WHERE workspace_id = $1 AND source_kind = 'canvas'
          AND (project_id <> $2 OR NOT (agent_id = ANY($3::text[])))
          AND NOT ((project_id, agent_id) IN (SELECT * FROM unnest($4::text[], $5::text[])))`,
      [cleanWorkspaceId, cleanProjectId, rows.map((row) => row.agentId), kept.map(([p]) => p), kept.map(([, a]) => a)]
    );
    const grants = [
      ...rows.map((row) => ({ ...row, projectId: cleanProjectId, fromWindow: false })),
      ...windows.flatMap((w) => w.rows.map((row) => ({ ...row, projectId: w.projectId, fromWindow: true }))),
    ];
    for (const row of grants) {
      // A window's own project is stamped a moment after the board's main
      // project (clock_timestamp, not the transaction's NOW), so an agent that
      // names no project gets the one its window shows, every time, not
      // whichever row a tie in updated_at happens to put first.
      await client.query(
        `INSERT INTO workspace_agent_projects
         (workspace_id, project_id, agent_id, permission, source_kind, source_id, created_by_user_id, updated_at)
         VALUES ($1, $2, $3, $4, 'canvas', $5, $6, CASE WHEN $7::boolean THEN clock_timestamp() ELSE NOW() END)
         ON CONFLICT (workspace_id, project_id, agent_id, source_kind) DO UPDATE SET
           permission = EXCLUDED.permission,
           source_id = EXCLUDED.source_id,
           created_by_user_id = EXCLUDED.created_by_user_id,
           updated_at = EXCLUDED.updated_at`,
        [cleanWorkspaceId, row.projectId, row.agentId, row.permission, sourceId, userId, row.fromWindow]
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
