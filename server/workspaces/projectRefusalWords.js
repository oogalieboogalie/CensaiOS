import pool from '../db.js';
import { createLogger } from '../logger.js';
import { getSubAgentById } from '../memory.js';
import { safeErrorCode } from '../security/errorCode.js';
import { listWorkspaceAgentProjects } from './projectMemberships.js';

// What an agent passes on to the person when a board refuses it a project.
// On a board that gave the agent other projects it names them, so a repo the
// board never shared does not read as "none is open". Trust mode is often
// blamed, so say what it does and what actually opens files.
const log = createLogger('tools');
const TRUST = 'Trust mode does not change this: it only lets agents use the tools they already have without waiting for an OK.';
export const NO_PROJECT_FILES = `Tell the person in plain words: I can only open files in a project that is open on this board, and none is open for me yet. Open a project from the top bar while my chat window is on the board, then ask again. ${TRUST}`;
const NAMED = 6;

/** "a", "a and b", "a, b and c"; past NAMED the rest are counted. */
function listOf(names) {
  const shown = names.slice(0, NAMED);
  if (names.length > NAMED) shown.push(`${names.length - NAMED} more`);
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : shown[0];
}

/** A GitHub project by its repo, as people ask for it; a folder project by its name. */
const nameOf = (row) => `"${String(row.project_repo || row.project_name || row.project_id).slice(0, 80)}"${row.permission === 'work' ? '' : ' (to read only)'}`;

/** The projects the board gave the agent, each once (work over read); a board's own helper agent has its parent's. */
async function boardProjects(db, agentId, context) {
  const sub = await getSubAgentById(agentId, context);
  const rows = await listWorkspaceAgentProjects(db, { workspaceId: context.workspaceId, agentId: sub?.parent_id || agentId });
  const byProject = new Map();
  for (const row of rows) {
    if (byProject.get(row.project_id)?.permission !== 'work') byProject.set(row.project_id, row);
  }
  return [...byProject.values()];
}

/**
 * The plain words for a project a board refused the agent (PROJECT_ACCESS_DENIED).
 * Never throws: when the board's projects cannot be read it gives NO_PROJECT_FILES.
 */
export async function projectRefusalWords(agentId, context = {}, err = null, { db = pool } = {}) {
  if (!context.workspaceId) return NO_PROJECT_FILES;
  let projects;
  try {
    projects = await boardProjects(db, agentId, context);
  } catch (listErr) {
    log.warn('could not list the board projects for a refusal', { code: safeErrorCode(listErr) });
    return NO_PROJECT_FILES;
  }
  if (!projects.length) return NO_PROJECT_FILES;
  const open = projects.length === 1
    ? `The project open for me here is ${nameOf(projects[0])}.`
    : `The projects open for me here are ${listOf(projects.map(nameOf))}.`;
  if (err?.readOnly) return `Tell the person in plain words: on this board I can read that project but not change it. ${open} ${TRUST}`;
  return `Tell the person in plain words: that project is not open for me on this board. ${open} To use another one, open it from the top bar while my chat window is on the board, then ask again. ${TRUST}`;
}
