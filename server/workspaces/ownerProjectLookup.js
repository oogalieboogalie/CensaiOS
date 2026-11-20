import { ProjectMembershipError } from './membershipInput.js';
import { resolveAuthorizedWorkspaceProject } from './projectAccess.js';
import { notGiven, ownerDrives } from './ownerProjects.js';

// Finding a project by its name for the owner rule in ownerProjects.js. It is
// its own file so the checks there load without the board's project lookup.

async function anyProject(db, identifier) {
  const { rows } = await db.query(
    `SELECT p.* FROM projects p
      WHERE p.id = $1 OR lower(p.name) = lower($1) OR p.path = $1 OR p.repo = $1
         OR ($1 NOT LIKE '%/%' AND p.repo LIKE ('%/' || $1))
         OR lower(regexp_replace(p.path, '^.*[/\\\\]', '')) = lower($1)
      ORDER BY CASE WHEN p.id = $1 THEN 0 WHEN p.path = $1 OR p.repo = $1 THEN 1 ELSE 2 END, p.updated_at DESC
      LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

// The projects this board gave any of its agents, each once, newest first. A
// project a hand-off lent for one plan or one to-do is not the board's own.
const SHOWN = 6;
async function boardProjects(db, workspaceId) {
  const { rows } = await db.query(
    `SELECT p.*, bool_or(wap.permission = 'work') AS board_work
       FROM workspace_agent_projects wap
       JOIN projects p ON p.id = wap.project_id
      WHERE wap.workspace_id = $1
        AND wap.source_kind <> 'task' AND COALESCE(wap.source_id, '') NOT LIKE 'agent-task:%'
      GROUP BY p.id
      ORDER BY max(wap.updated_at) DESC
      LIMIT ${SHOWN + 1}`,
    [workspaceId]
  );
  return rows;
}

/**
 * The owner asked an agent the board gave no project, and the call named none:
 * the one project open on this board. Several: say which, so the agent can
 * name one. None: the board's own refusal stands.
 */
async function boardProjectForOwner(db, options, refusal) {
  const projects = await boardProjects(db, options.workspaceId);
  if (projects.length === 0) throw refusal;
  if (projects.length > 1) {
    const names = projects.slice(0, SHOWN).map((p) => `"${String(p.name || p.id).slice(0, 80)}"`);
    if (projects.length > SHOWN) names.push('more');
    throw new ProjectMembershipError(
      `More than one project is open on this board: ${names.join(', ')}. Call again with project set to the one you mean.`,
      { code: 'PROJECT_NAME_NEEDED', statusCode: 400 }
    );
  }
  const [{ board_work: boardWork, ...project }] = projects;
  if (!boardWork && options.requiredPermission === 'work') {
    throw new ProjectMembershipError(
      `"${String(project.name || project.id).slice(0, 80)}" is open on this board to read only: it can be read here but not changed.`,
      { code: 'PROJECT_READ_ONLY', statusCode: 403, readOnly: true }
    );
  }
  return project;
}

/**
 * resolveAuthorizedWorkspaceProject, plus, when this computer's owner drives the chat: any project
 * on this computer by name, and with no name the one project open on the board.
 */
export async function resolveProjectForDriver(db, options, context = {}, deps = {}) {
  try {
    return await resolveAuthorizedWorkspaceProject(db, options);
  } catch (error) {
    const identifier = options.projectIdentifier ? String(options.projectIdentifier).trim() : '';
    if (!notGiven(error) || !(await ownerDrives(context, { db, ...deps }))) throw error;
    if (!identifier) return boardProjectForOwner(db, options, error);
    const project = await anyProject(db, identifier);
    if (!project) throw new ProjectMembershipError(`There is no project named "${identifier}" on this computer.`, { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    return project;
  }
}
