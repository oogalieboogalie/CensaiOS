import fs from 'fs';
import path from 'path';
import { inHiddenFolder, isSecretFileName } from './secretFiles.js';

// What in a project only this computer's owner opens: a file whose name says
// it holds keys or passwords, anything in a hidden folder (.git, .ssh, a
// tool's logins), and anything a link leads to outside the project. The board
// (server/routes/files/teammateFiles.js) and a teammate's agents
// (server/tools/rbac/ownerOnlyReads.js) keep them for the owner.

const same = process.platform === 'win32' ? (p) => p.toLowerCase() : (p) => p;

function within(target, base) {
  const t = same(target);
  const b = same(base);
  return t === b || t.startsWith(b.endsWith(path.sep) ? b : b + path.sep);
}

/** Where `target` really leads: the real path of its nearest folder that exists, plus the rest. */
export async function realTarget(target) {
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

/**
 * 'outside' when `target` really leads out of the project at `base`, 'secret'
 * when it is a secret file or in a hidden folder (as asked or where a link
 * leads), else null. With isFile false, `target` is a folder.
 */
export async function ownerOnlyKind({ target, base }, { isFile = true } = {}) {
  const [real, realBase] = await Promise.all([realTarget(target), realTarget(base)]);
  if (!within(real, realBase)) return 'outside';
  if (isFile && (isSecretFileName(path.basename(target)) || isSecretFileName(path.basename(real)))) return 'secret';
  const hidden = (to, from) => inHiddenFolder(path.relative(from, to), { isFile });
  return hidden(target, base) || hidden(real, realBase) ? 'secret' : null;
}
