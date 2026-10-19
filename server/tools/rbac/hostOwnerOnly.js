// Agent tools that change this computer itself (run commands, git commits and
// pushes, Docker, files on disk, the app's database, project folders, Vex runs)
// act for whoever is driving the chat. Only the computer's owner may drive
// them, the same rule the host routes follow (server/security/systemAdmin.js).
// Tools that only look (status, file lists, file contents, git history) stay
// open to everyone on the board.
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { assertSystemAdmin, OWNER_ONLY_MESSAGE } from '../../security/systemAdmin.js';

export const HOST_CHANGING_TOOL_NAMES = Object.freeze([
  // Files and project folders on this computer
  'local_write_file', 'open_project', 'refresh_brief', 'report',
  'project_write', 'project_edit', 'project_multi_edit', 'generate_tests',
  // Git and GitHub with the owner's own checkout and token
  'local_git_fetch', 'local_git_pull_ff_only', 'local_git_checkpoint', 'local_git_verify',
  'github_write_file', 'github_create_issue', 'github_comment_issue', 'submit_pr', 'merge_pr',
  // Commands, Docker and the shared terminal
  'run_tests', 'run_linter', 'sandbox_exec', 'terminal_run', 'restart_service',
  // The owner's mail server
  'mailcow_add_mailbox', 'mailcow_delete_mailbox', 'mailcow_add_alias', 'mailcow_delete_alias',
]);

const ALWAYS = new Set(HOST_CHANGING_TOOL_NAMES);

// Tools the owner adds by hand (server/tools/dynamic/, config/mcp_servers.json)
// can do anything, so each one counts as a change unless it says it only
// looks: a dynamic tool exports `looksOnly = true`, an MCP tool carries the
// standard `readOnlyHint: true` annotation.
const HAND_ADDED_CHANGES = new Set();

/** Sort one hand-added tool into look or change when it is loaded. */
export function registerHandAddedTool(name, { looksOnly = false } = {}) {
  if (!name) return;
  if (looksOnly === true) HAND_ADDED_CHANGES.delete(name);
  else HAND_ADDED_CHANGES.add(name);
}

/** Whether this call would change something on the computer. */
export function changesHost(name, args = {}) {
  if (ALWAYS.has(name) || HAND_ADDED_CHANGES.has(name)) return true;
  // A Vex security scan only reads; any other Vex run starts agents on the PC.
  if (name === 'vex_run') return String(args?.task || 'demo') !== 'vulnerability_check';
  // Reading the app's database is fine; writing to it is not.
  if (name === 'postgres_query' || name === 'postgres_exec_file') return Boolean(args?.allow_write);
  return false;
}

export class ComputerOwnerOnlyError extends Error {
  constructor(message = OWNER_ONLY_MESSAGE) {
    super(message);
    this.name = 'ComputerOwnerOnlyError';
    this.code = 'COMPUTER_OWNER_ONLY';
    this.statusCode = 403;
  }
}

/**
 * Throws ComputerOwnerOnlyError unless the person behind this call is the
 * computer's owner. Work the desktop app runs for itself (no person behind
 * it) is the owner's own, as with the owner's keys (security/serverKeys.js).
 */
export async function assertHostToolAllowed(db, { name, args, context = {}, mode = getRuntimeMode() } = {}) {
  if (!changesHost(name, args)) return { enforced: false };
  const userId = Number(context.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    if (context.userId == null && mode === RUNTIME_MODES.LOCAL_DESKTOP) return { enforced: false };
    throw new ComputerOwnerOnlyError();
  }
  try {
    await assertSystemAdmin({ session: { userId } }, { db });
  } catch (error) {
    if (error?.statusCode === 401 || error?.statusCode === 403) throw new ComputerOwnerOnlyError();
    throw new ComputerOwnerOnlyError("Couldn't check who owns this computer right now. Try again in a moment.");
  }
  return { enforced: true, userId };
}
