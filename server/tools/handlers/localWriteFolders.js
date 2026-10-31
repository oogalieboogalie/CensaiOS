// Where local_write_file may write for an agent that has no folders of its own
// (none set in the Agent Designer and no bound project). Before, such an agent
// could write anywhere on the computer. Now it writes inside the projects
// folder, the board workspaces folder, or a project censaiOS has open.
import path from 'path';
import pool from '../../db.js';
import { projectsHome } from '../../projectGit/newProject.js';
import { getWorkspacesRoot, mapProjectPathForRuntime } from '../../workspaces/shared.js';
import { noteToolFailure } from '../toolsLog.js';

export async function defaultWriteFolders({ db = pool, env = process.env } = {}) {
  const folders = [projectsHome(env), getWorkspacesRoot()];
  try {
    const { rows } = await db.query("SELECT DISTINCT path FROM projects WHERE COALESCE(path, '') <> ''");
    for (const { path: projectPath } of rows) {
      folders.push(projectPath, mapProjectPathForRuntime(projectPath));
    }
  } catch (err) {
    noteToolFailure('could not list open projects for write folders', {}, err);
  }
  // A folder at the top of a drive would let the agent write anywhere again.
  return [...new Set(folders.filter(Boolean).map(f => path.resolve(f)))]
    .filter(f => path.dirname(f) !== f);
}
