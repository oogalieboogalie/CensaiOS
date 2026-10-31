import pool from '../../db.js';
import { isComputerOwner, OWNER_UNCHECKED_MESSAGE } from '../../security/systemAdmin.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { listOpenProjectRoots } from './shared.js';

// A board's agents work in the projects the board gives them, with this
// computer's files and its GitHub key. So only this computer's owner gives a
// board's agents a project that is new to the board. Anyone on the board may
// still hand the board's own projects to its agents, and the projects this
// computer's owner has open (the ones Files opens on a board), as a board
// does each time it is saved (src/lib/projectPrewarm.js).
export const NEW_PROJECT_OWNER_ONLY = "Only this computer's owner can give this board's agents a project that is not open on this board. This computer's owner can open it here.";

const folderKey = (folder) => resolveProjectPathForRuntime(folder).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

async function boardHas(db, workspaceId, projectId) {
  const { rows } = await db.query(
    'SELECT 1 FROM workspace_agent_projects WHERE workspace_id = $1 AND project_id = $2 LIMIT 1',
    [workspaceId, projectId]
  );
  return rows.length > 0;
}

async function openOnThisComputer(db, projectId) {
  const { rows } = await db.query('SELECT path FROM projects WHERE id = $1', [projectId]);
  if (!rows[0]?.path) return false;
  const folder = folderKey(rows[0].path);
  return (await listOpenProjectRoots()).some((root) => folderKey(root.path) === folder);
}

/**
 * Null when this request may give the board's agents `projectId`, else the
 * status and plain words to answer with. A request that gives no agent
 * anything passes. Anyone but the owner hears the same words whether or not
 * the project is there.
 */
export async function refuseNewProjectToTeammate(req, { workspaceId, projectId, memberships, db = pool } = {}) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null;
  try {
    if (await boardHas(db, workspaceId, projectId) || await openOnThisComputer(db, projectId)) return null;
    if (await isComputerOwner(req, "giving a board's agents a new project", { db })) return null;
  } catch {
    return { status: 503, body: { error: OWNER_UNCHECKED_MESSAGE } };
  }
  return { status: 403, body: { error: NEW_PROJECT_OWNER_ONLY, reason: 'owner-only', code: 'computer_owner_only' } };
}
