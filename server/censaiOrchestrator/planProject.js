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
// Nothing found leaves the name as it was, and the checks say why.

import { isPastProject } from '../workspaces/familyPast.js';
import { resolveProjectForDriver } from '../workspaces/ownerProjectLookup.js';
import { resolveAuthorizedWorkspaceProject } from '../workspaces/projectAccess.js';
import { HANDOFF_GIVER } from './projectShare.js';

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

/** The plan's project row for this person on this board, or null when there is none to pin. */
export async function planProject(db, { workspaceId, userId, project = null }, deps = {}) {
  const name = String(project || '').trim().slice(0, 200);
  if (!workspaceId) return null;
  if (!name) {
    const own = await onBoard(db, workspaceId, null);
    return own && !isPastProject(own) ? own : null;
  }
  const given = await onBoard(db, workspaceId, name);
  if (given) return given;
  const found = await maybe(() => resolveProjectForDriver(db, {
    workspaceId, agentId: HANDOFF_GIVER, projectIdentifier: name,
  }, { userId }, deps));
  if (!found?.repo || !found.path) return found;
  const local = await onBoard(db, workspaceId, found.path);
  return local && !local.repo && local.path === found.path ? local : found;
}
