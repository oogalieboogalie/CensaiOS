import pool from '../../db.js';
import { isComputerOwner } from '../../security/systemAdmin.js';
import { folderKey } from './newProjectOwnerOnly.js';
import { listOpenProjectRoots } from './shared.js';

// Every project opened on this computer, with its folder, its GitHub repo and
// its summary, is for this computer's owner. Anyone else gets the projects
// open on this computer's boards (the ones Files and a window's project menu
// already offer them) and the projects the boards shared with them give
// their agents (which each board's own project list already shows its
// members). Off a board, an agent lists projects for the owner only too
// (server/tools/rbac/ownerOnlyReads.js).

const repoKey = (repo) => String(repo || '').trim().toLowerCase();

/** The projects the boards this person is on give their agents. */
async function boardProjects(db, userId) {
  if (!Number.isInteger(userId) || userId <= 0) return [];
  const { rows } = await db.query(
    `SELECT DISTINCT p.id, p.path, p.repo
       FROM workspace_agent_projects wap
       JOIN workspace_members wm ON wm.workspace_id = wap.workspace_id
       JOIN projects p ON p.id = wap.project_id
      WHERE wm.user_id = $1`,
    [userId]
  );
  return rows;
}

/**
 * The part of `projects` (rows of the projects table) this request may see:
 * all of them for this computer's owner; for anyone else, the ones open on
 * this computer's boards or given to the agents of a board they are on,
 * matched by id, folder or GitHub repo. A database error is thrown.
 */
export async function projectsFor(req, projects, { db = pool } = {}) {
  if (await isComputerOwner(req, null, { db })) return projects;
  const onBoards = await boardProjects(db, Number(req?.session?.userId));
  const ids = new Set(onBoards.map((p) => p.id));
  const folders = new Set((await listOpenProjectRoots()).map((root) => folderKey(root.path)));
  for (const p of onBoards) if (p.path) folders.add(folderKey(p.path));
  const repos = new Set(onBoards.map((p) => repoKey(p.repo)).filter(Boolean));
  return projects.filter((p) => ids.has(p.id)
    || (p.path && folders.has(folderKey(p.path)))
    || (p.repo && repos.has(repoKey(p.repo))));
}
