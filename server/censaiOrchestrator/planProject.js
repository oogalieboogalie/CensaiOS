// Censai the orchestrator: which project a plan works in, found once as it is
// handed off and kept by its id, so the hand-off's checks, the test gate, the
// project share (projectShare.js) and the family member's own tools all find
// the same project row.
//
// One rule book, the board's (server/workspaces/projectAccess.js):
// - No project named: Censai's own project on this board, the one a call that
//   names none lands in (the project Censai's window is set to, #1094).
// - A project Censai has on this board: that one.
// - Any other: the owner rule (server/workspaces/ownerProjectLookup.js), so
//   only this computer's owner reaches a project the board never gave. When the
//   row it finds is kept on GitHub (its saves go to GitHub, where this
//   computer's tests cannot see them) and Censai has a project on this board
//   in the same folder that is not, the plan works in that one: the same code,
//   saved where its tests run.
// - When a job needs this computer's tests (testsHere), a row kept on GitHub,
//   on the board or found by the owner's lookup, gives way to a project of
//   Censai's here with the same code: one in the same folder, or Censai's own
//   (the one its window is set to) when its folder here is a checkout of the
//   same GitHub repo (folderRepo.js). Jobs that need GitHub itself (a pull
//   request, a branch) keep the GitHub row.
// Nothing found leaves the name as it was, and the checks say why.

import { isPastProject } from '../workspaces/familyPast.js';
import { resolveProjectForDriver } from '../workspaces/ownerProjectLookup.js';
import { resolveAuthorizedWorkspaceProject } from '../workspaces/projectAccess.js';
import { HANDOFF_GIVER } from './projectShare.js';
import { folderRepos, repoKey } from './folderRepo.js';

const NOT_REACHED = new Set(['PROJECT_ACCESS_DENIED', 'PROJECT_NOT_FOUND']);

async function maybe(find) {
  try {
    return await find();
  } catch (error) {
    if (NOT_REACHED.has(error?.code)) return null;
    throw error;
  }
}

/** Censai's project on this board that `identifier` names (null: the one a call naming none gets), or null. */
function onBoard(db, workspaceId, identifier) {
  return maybe(() => resolveAuthorizedWorkspaceProject(db, { workspaceId, agentId: HANDOFF_GIVER, projectIdentifier: identifier }));
}

const hasFolderHere = (row) => Boolean(row && !row.repo && row.path && !isPastProject(row));

/** Censai's own project on this board when its folder here is a checkout of `row`'s repo, or null. */
async function ownCheckoutOf(db, workspaceId, row, deps) {
  const key = repoKey(row?.repo);
  if (!key) return null;
  const own = await onBoard(db, workspaceId, null);
  if (!hasFolderHere(own) || own.id === row.id) return null;
  const repos = await (deps.folderRepos || folderRepos)(own.path);
  return repos.has(key) ? own : null;
}

/** Censai's project on this board in the same folder as `row`, kept here (not on GitHub), or null. */
async function sameFolderHere(db, workspaceId, row) {
  if (!row?.path) return null;
  const local = await onBoard(db, workspaceId, row.path);
  return hasFolderHere(local) && local.path === row.path ? local : null;
}

/** A row kept on GitHub becomes the project here with the same code, when there is one. */
async function hereInsteadOf(db, workspaceId, row, deps) {
  if (!row?.repo) return row;
  return await sameFolderHere(db, workspaceId, row) || await ownCheckoutOf(db, workspaceId, row, deps) || row;
}

/** Whether a folder's GitHub remotes are known and none is `repo`: then it is other code, never offered as a retry. */
export async function folderIsOtherRepo(projectPath, repo, deps = {}) {
  const key = repoKey(repo);
  const repos = await (deps.folderRepos || folderRepos)(projectPath);
  return Boolean(key && repos.size && !repos.has(key));
}

/** The plan's project row for this person on this board, or null when there is none to pin. */
export async function planProject(db, { workspaceId, userId, project = null, testsHere = false }, deps = {}) {
  const name = String(project || '').trim().slice(0, 200);
  if (!workspaceId) return null;
  if (!name) {
    const own = await onBoard(db, workspaceId, null);
    return own && !isPastProject(own) ? own : null;
  }
  const given = await onBoard(db, workspaceId, name);
  if (given) return testsHere ? hereInsteadOf(db, workspaceId, given, deps) : given;
  const found = await maybe(() => resolveProjectForDriver(db, {
    workspaceId, agentId: HANDOFF_GIVER, projectIdentifier: name,
  }, { userId }, deps));
  if (!found?.repo) return found;
  if (testsHere) return hereInsteadOf(db, workspaceId, found, deps);
  // As before #1108's caller asked: the same folder here, when the board has it.
  return (await sameFolderHere(db, workspaceId, found)) || found;
}
