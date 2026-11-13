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

// Off a board nothing is shared with anyone, so only this computer's owner's
// agents reach its projects there (a folder or a GitHub repo opened as one)
// and read GitHub through its key (a repo by its name). An agent on a board
// works in the projects and repos the board gave it
// (server/workspaces/projectMemberships.js). Changing something is the
// owner's alone everywhere (server/tools/rbac/hostOwnerOnly.js).
export const GITHUB_OFF_BOARD = "Only this computer's owner's agents read GitHub with its key outside a board. Tell the person in plain words: I can read a GitHub repo for you in my chat on a board where that repo is open as a project.";
export const PROJECT_OFF_BOARD = "Only this computer's owner's agents work in its projects outside a board. Tell the person in plain words: I can work in a project for you in my chat on a board where that project is open.";

/** `words` for anyone but the owner, or null for the owner's agents; `feature` names the use in the refusal's log line. */
async function ownerOnlyOffBoard(context, words, { feature, db = pool, mode = getRuntimeMode() } = {}) {
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    if (context.userId == null && mode === RUNTIME_MODES.LOCAL_DESKTOP) return null;
    logOwnerRefusal(feature, 401);
    return words;
  }
  try {
    return await isComputerOwner({ session: { userId } }, feature, { db }) ? null : words;
  } catch {
    return OWNER_UNCHECKED_MESSAGE;
  }
}

/** The plain words an agent gets for a GitHub repo read by its name off a board, or null for the owner's. */
export const offBoardGithubRead = (context, options) => ownerOnlyOffBoard(context, GITHUB_OFF_BOARD, options);

/**
 * Off a board (a chat sent with no board, as a teammate's own browser can
 * send one, or a run started elsewhere) only this computer's owner's agents
 * find, list or read a project; anyone else's get PROJECT_OFF_BOARD, thrown
 * before any project is looked up. On a board this checks nothing.
 */
export async function refuseProjectsOffBoard(context = {}, { db = pool, mode = getRuntimeMode() } = {}) {
  if (context.workspaceId) return;
  const refused = await ownerOnlyOffBoard(context, PROJECT_OFF_BOARD, { feature: 'agent use of a project off a board', db, mode });
  if (refused) throw Object.assign(new Error(refused), { statusCode: 403 });
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
