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

/** resolveAuthorizedWorkspaceProject, plus any project on this computer when its owner drives the chat. */
export async function resolveProjectForDriver(db, options, context = {}, deps = {}) {
  try {
    return await resolveAuthorizedWorkspaceProject(db, options);
  } catch (error) {
    const identifier = options.projectIdentifier ? String(options.projectIdentifier).trim() : '';
    if (!notGiven(error) || !identifier || !(await ownerDrives(context, { db, ...deps }))) throw error;
    const project = await anyProject(db, identifier);
    if (!project) throw new ProjectMembershipError(`There is no project named "${identifier}" on this computer.`, { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    return project;
  }
}
