import pool from '../../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { assertSystemAdmin, isComputerOwner, OWNER_UNCHECKED_MESSAGE } from '../../security/systemAdmin.js';
import { logOwnerRefusal } from '../../security/ownerNames.js';
import { ownerOnlyKind } from '../../security/ownerOnlyFiles.js';
import { secretRepoPath } from '../../security/secretFiles.js';
import { isGithubProject, resolveInsideProject } from '../../workspaces/shared.js';
import { FILE_PROBLEMS } from '../../../shared/files/fileProblems.js';

// An agent reads a project's files for whoever drives its chat, and what it
// reads lands in that chat on the shared board. So a teammate's agent never
// reads a file only this computer's owner opens on the board: a .env, a key
// file, anything in a hidden folder, or a link out of the project
// (server/security/ownerOnlyFiles.js). In a GitHub project it is a file that
// holds keys by its name, as on the board's GitHub files (server/routes/github/content.js).

/** Whether this computer's owner drives the chat; the desktop app's own work is the owner's. */
async function ownerDriving(context, { db, mode }) {
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) return context.userId == null && mode === RUNTIME_MODES.LOCAL_DESKTOP;
  return assertSystemAdmin({ session: { userId } }, { db }).then(() => true, () => false);
}

/** 'outside', 'secret' or null for `rel` in `project` (see ownerOnlyKind). */
async function kindOf(project, rel) {
  if (isGithubProject(project)) return secretRepoPath(rel) ? 'secret' : null;
  let target;
  try {
    target = resolveInsideProject(project.path, rel);
  } catch {
    return null; // a path out of the project: the read itself says so
  }
  return ownerOnlyKind({ target, base: resolveInsideProject(project.path, '.') });
}

// Off a board no repo is shared with anyone, so only this computer's owner's
// agents read GitHub through its key there: a repo by its name, or a GitHub
// project (an agent on a board reads the repos the board gave it:
// server/workspaces/projectMemberships.js). Changing something on GitHub with
// the key is the owner's alone everywhere (server/tools/rbac/hostOwnerOnly.js).
export const GITHUB_OFF_BOARD = "Only this computer's owner's agents read GitHub with its key outside a board. Tell the person in plain words: I can read a GitHub repo for you in my chat on a board where that repo is open as a project.";

/**
 * The plain words an agent gets for a GitHub read off a board, or null for
 * the owner's; `feature` names the read in the refusal's log line.
 */
export async function offBoardGithubRead(context, { feature, db = pool, mode = getRuntimeMode() } = {}) {
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    if (context.userId == null && mode === RUNTIME_MODES.LOCAL_DESKTOP) return null;
    logOwnerRefusal(feature, 401);
    return GITHUB_OFF_BOARD;
  }
  try {
    return await isComputerOwner({ session: { userId } }, feature, { db }) ? null : GITHUB_OFF_BOARD;
  } catch {
    return OWNER_UNCHECKED_MESSAGE;
  }
}

/**
 * The plain words a teammate's agent gets instead of `rel` in a project it
 * works in, or null when it may read it.
 */
export async function ownerOnlyProjectRead(context, project, rel, { tool, db = pool, mode = getRuntimeMode() } = {}) {
  const kind = await kindOf(project, rel);
  if (!kind || await ownerDriving(context, { db, mode })) return null;
  logOwnerRefusal(`agent tool ${tool}`, 403, Number(context.userId) || null);
  return kind === 'outside' ? FILE_PROBLEMS.outside : FILE_PROBLEMS.ownerOnly;
}
