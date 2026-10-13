import {
  ProjectMembershipError,
  assertAgentProjectAccess,
} from './projectMemberships.js';

function requiredText(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new ProjectMembershipError(`${label} is required.`);
  return result;
}

export async function resolveAuthorizedWorkspaceProject(db, {
  workspaceId,
  agentId,
  projectIdentifier = null,
  requiredPermission = 'read',
}) {
  const identifier = projectIdentifier ? String(projectIdentifier).trim() : null;
  const { rows } = await db.query(
    `SELECT p.*, wap.permission AS workspace_permission
       FROM workspace_agent_projects wap
       JOIN projects p ON p.id = wap.project_id
      WHERE wap.workspace_id = $1 AND wap.agent_id = $2
        AND ($3::text IS NULL OR p.id = $3 OR lower(p.name) = lower($3)
          OR p.path = $3 OR p.repo = $3
          OR ($3 NOT LIKE '%/%' AND p.repo LIKE ('%/' || $3)))
      ORDER BY
        CASE WHEN p.id = $3 THEN 0 WHEN p.path = $3 OR p.repo = $3 THEN 1 ELSE 2 END,
        CASE wap.permission WHEN 'work' THEN 0 ELSE 1 END, wap.updated_at DESC
      LIMIT 1`,
    [requiredText(workspaceId, 'workspaceId'), requiredText(agentId, 'agentId'), identifier]
  );
  const project = rows[0];
  if (!project) {
    throw new ProjectMembershipError(
      'This agent is not authorized for that project in the current workspace.',
      { code: 'PROJECT_ACCESS_DENIED', statusCode: 403 }
    );
  }
  await assertAgentProjectAccess(db, {
    workspaceId,
    projectId: project.id,
    agentId,
    requiredPermission,
  });
  delete project.workspace_permission;
  return project;
}
