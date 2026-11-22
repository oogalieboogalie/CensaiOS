// Trust mode on the owner's own computer: no walls for the owner's agents.
//
// A board fences each agent into the projects it was given, read only where it
// was given to read, and inside its own folder for the local file tools. That
// fence keeps a teammate (a friend who joined with a party code) from sending
// an agent into the owner's folders. It is not meant to stop the owner: when
// this computer's owner drives the chat and Trust mode is on for that agent,
// the agent works anywhere on this computer:
// - a project given to read only can be changed;
// - a project kept on GitHub that is also checked out here is worked on in the
//   folder here (reads, saves, runs, tests), so nothing says "GitHub-backed";
// - the local file tools reach any folder.
// Anyone else's chat keeps every fence, whatever the switch says. Tools whose
// job is GitHub itself (pull requests, Jules, a sub-agent on its own branch)
// keep the GitHub project. A folder limit set on one agent on purpose (its
// tool scopes) stays: the switch lifts the board's fence, not that choice.
// Off a board nothing changes: Trust mode is a board's switch, so there is
// none to read there.

import { AsyncLocalStorage } from 'node:async_hooks';
import pool from '../db.js';
import { agentIsTrusted } from '../approvals/trustMode.js';
import { folderRepos, repoKey } from '../censaiOrchestrator/folderRepo.js';
import { isPastProject } from './familyPast.js';
import { ownerDrives } from './ownerProjects.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';

const log = createLogger('workspaces');

// A run nobody at the screen started for this (a workflow a board trigger set off,
// perhaps on a teammate's window) keeps every fence, even under the owner's name.
const fencedForRun = new AsyncLocalStorage();

/** Run `fn` with the fence up whatever Trust mode says. */
export function runFenced(fn) {
  return fencedForRun.run(true, fn);
}

/** Whether this agent works with no walls: on a board, the computer's owner drives, and Trust mode is on for it. */
export async function ownerUnfenced(context = {}, agentId, deps = {}) {
  if (!context.workspaceId || fencedForRun.getStore()) return false;
  const db = deps.db || pool;
  const where = deps.mode ? { db, mode: deps.mode } : { db };
  if (!(await (deps.ownerDrives || ownerDrives)(context, where))) return false;
  return (deps.agentIsTrusted || agentIsTrusted)(db, { workspaceId: context.workspaceId, agentId });
}

const MOST_FOLDERS = 60;

// Whether the board gives this agent the project (so a folder the board already has wins a tie).
async function onBoardFor(db, context, agentId, row) {
  if (!context?.workspaceId || !agentId) return false;
  try {
    // Loaded here, only for a tie: every tool call loads this file, and most never need it.
    const { resolveAuthorizedWorkspaceProject } = await import('./projectAccess.js');
    await resolveAuthorizedWorkspaceProject(db, { workspaceId: context.workspaceId, agentId, projectIdentifier: row.id });
    return true;
  } catch { /* quiet: not on the board is an answer here */
    return false;
  }
}

/**
 * The project with a folder here holding the same code as `project`, kept on GitHub (its git
 * origin is that repo), or null. Two folders of the same repo: the one the board gives this
 * agent; still more than one, or none on the board, keep the GitHub project rather than guess.
 */
export async function localCheckout(project, deps = {}, { context = null, agentId = null } = {}) {
  const key = repoKey(project?.repo);
  if (!key) return null;
  const db = deps.db || pool;
  const readRepos = deps.folderRepos || folderRepos;
  // The GitHub project's own folder, when it has one here that is a checkout of it.
  if (project.path && (await readRepos(project.path)).has(key)) return { ...project, repo: null, github_repo: project.repo };
  const { rows } = await db.query(
    `SELECT * FROM projects
      WHERE (repo IS NULL OR repo = '') AND path IS NOT NULL AND path <> ''
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${MOST_FOLDERS}`,
  );
  const matches = [];
  for (const row of rows) {
    if (!isPastProject(row) && (await readRepos(row.path)).has(key)) matches.push(row);
  }
  let pick = matches.length === 1 ? matches[0] : null;
  if (matches.length > 1) {
    const given = [];
    for (const row of matches) if (await onBoardFor(db, context, agentId, row)) given.push(row);
    pick = given.length === 1 ? given[0] : null;
    if (!pick) log.warn('more than one folder here holds this GitHub project; keeping GitHub', { agentId, folders: matches.length });
  }
  return pick ? { ...pick, github_repo: project.repo } : null;
}

/** The folder here for a GitHub project when this agent has no walls; null keeps the project as it is. */
export async function hereWhenTrusted(project, agentId, context = {}, deps = {}) {
  if (!project?.repo) return null;
  try {
    if (!(await ownerUnfenced(context, agentId, deps))) return null;
    return await localCheckout(project, deps, { context, agentId });
  } catch (err) {
    // The GitHub project stays, and the tool says what that means (for example "GitHub-backed").
    log.warn('could not look for the folder here for a GitHub project', { agentId, code: safeErrorCode(err) });
    return null;
  }
}
