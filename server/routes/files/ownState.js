import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CENSAI_STATE_DIR isolates local-state reads (tests, sandboxes) from the
// checkout's live .homebase-state without changing default behavior.
export const LOCAL_STATE_DIR = process.env.CENSAI_STATE_DIR
  ? path.resolve(process.env.CENSAI_STATE_DIR)
  : path.resolve(path.join(__dirname, '..', '..', '..', '.homebase-state'));

// censaiOS's own state folder holds its keys (generated-secrets.env), the CLI
// tools' logins, its logs and its lists, so nothing in it opens on the board,
// for anyone, and it never becomes a project. Any folder of that name counts
// (a censaiOS folder opened as a project has one), in any case, as does one
// HOMEBASE_STATE_DIR names, and a link counts where it really leads.
const STATE_FOLDER = '.homebase-state';
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

/** Where `target` really leads: the real path of its nearest folder that exists, plus the rest. */
async function realTarget(target) {
  const rest = [];
  for (let at = target; ; at = path.dirname(at)) {
    try {
      return path.join(await fs.promises.realpath(at), ...rest);
    } catch {
      if (path.dirname(at) === at) return target;
      rest.unshift(path.basename(at));
    }
  }
}

/** True for anything in censaiOS's own state folder, as written or where it really leads. */
export async function isOwnState(target) {
  const named = [LOCAL_STATE_DIR, process.env.HOMEBASE_STATE_DIR].filter(Boolean).map((dir) => path.resolve(dir));
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
