import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { realTarget } from '../../security/ownerOnlyFiles.js';
import { STATE_FOLDER } from '../../security/secretFiles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
// CENSAI_STATE_DIR isolates local-state reads (tests, sandboxes) from the
// checkout's live .homebase-state without changing default behavior.
export const LOCAL_STATE_DIR = process.env.CENSAI_STATE_DIR
  ? path.resolve(process.env.CENSAI_STATE_DIR)
  : path.join(REPO_ROOT, '.homebase-state');

// censaiOS's own state folder holds its keys (generated-secrets.env), the CLI
// tools' logins, its logs and its lists, so nothing in it opens on the board,
// for anyone, and it never becomes a project. Any folder of that name counts
// (a censaiOS folder opened as a project has one), in any case, as do the
// folders censaiOS's settings move its state to, and a link counts where it
// really leads. Its name (STATE_FOLDER) is kept with the rules for files that
// hold keys, server/security/secretFiles.js.

/**
 * The state folders censaiOS's settings name, read as server/cli-agents,
 * server/legion and server/logRetention.js read them. Only folders set aside
 * for censaiOS: CENSAI_CLI_AGENT_HOME may be a person's own home, so it is not one.
 * On Linux, /proc too: it shows every running program's settings, censaiOS's
 * keys among them (/proc/self/environ).
 */
function namedStateDirs(env = process.env) {
  return [
    LOCAL_STATE_DIR,
    env.HOMEBASE_STATE_DIR,
    env.CENSAI_CLI_AGENT_DATA,
    env.CENSAI_WORKTREE_DIR,
    env.CENSAI_LEGION_DIR,
    env.LOG_DIR && path.resolve(REPO_ROOT, env.LOG_DIR),
    process.platform === 'linux' && '/proc',
  ].filter(Boolean).map((dir) => path.resolve(dir));
}
export const OWN_STATE = 'CENSAI_OWN_STATE';
export const OWN_STATE_WORDS = 'censaiOS keeps its own keys and logins in this folder, so it does not open on the board.';

function within(target, base) {
  const t = target.toLowerCase();
  const b = base.toLowerCase();
  return t === b || t.startsWith(b + path.sep);
}

function inStateFolder(target, stateDirs) {
  return stateDirs.some((dir) => within(target, dir))
    // Windows opens "name." and "name::$DATA" as "name", so neither slips past.
    || target.toLowerCase().split(/[\\/]/).some((part) => part.split(':')[0].replace(/[. ]+$/, '') === STATE_FOLDER);
}

/** True for anything in censaiOS's own state folder, as written or where it really leads. */
export async function isOwnState(target) {
  const named = namedStateDirs();
  const stateDirs = [...named, ...await Promise.all(named.map((dir) => fs.promises.realpath(dir).catch(() => dir)))];
  return inStateFolder(target, stateDirs) || inStateFolder(await realTarget(target), stateDirs);
}

/** `target`, unless it is in the state folder: then an "Access denied" error with code OWN_STATE. */
export async function refuseOwnState(target) {
  if (await isOwnState(target)) {
    throw Object.assign(new Error('Access denied: censaiOS keeps its own keys and logins here'), { code: OWN_STATE });
  }
  return target;
}
