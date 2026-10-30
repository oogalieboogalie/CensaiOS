import { spawn } from 'child_process';
import { isSecretFileName, STATE_FOLDER } from '../security/secretFiles.js';

// Saved versions keep out every file that holds keys or passwords by its name
// (a project's .env, key and certificate files, copies and backups of them:
// server/security/secretFiles.js) and anything in censaiOS's own state
// folder. Saving a version never takes such a file in, nor a change to one an
// earlier version holds (that version's copy stays as it was), so what it
// holds now stays on this computer; Send to GitHub sends nothing while the
// versions it would send hold one.

const GIT_TIMEOUT_MS = 60_000;

/** True for a path in a project's repository, from its top, that versions keep out (a folder git lists as "name/" too). */
export function keptOutOfVersions(rel) {
  const parts = String(rel || '').replace(/[\\/]+$/, '').split(/[\\/]/);
  return isSecretFileName(parts[parts.length - 1]) || parts.some((part) => part.toLowerCase() === STATE_FOLDER);
}

/** keptOutOfVersions for a path as git's own bytes, judged both as bytes and as UTF-8 letters. */
export const keptOutName = (name) => keptOutOfVersions(name.toString('latin1')) || keptOutOfVersions(name.toString('utf8'));

/**
 * Collects, from names that each end with a NUL and come in pieces (git's
 * ls-files -z, log --name-only -z), the different ones versions keep out, as
 * git's own bytes, so a name in any encoding goes back to git as it is. Every
 * such name is told by its plain letters (.env, .pem, id_rsa), so each is
 * judged both as bytes and as UTF-8 letters (which keep a long name short).
 */
export function keptOutCollector() {
  const found = new Map();
  let rest = Buffer.alloc(0);
  return {
    add(chunk) {
      let data = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      for (let end = data.indexOf(0); end >= 0; end = data.indexOf(0)) {
        const name = data.subarray(0, end);
        const key = name.toString('latin1');
        if (key && !found.has(key) && keptOutName(name)) found.set(key, Buffer.from(name));
        data = data.subarray(end + 1);
      }
      rest = Buffer.from(data);
    },
    names: () => [...found.values()],
  };
}

/** The paths a git command lists (each ended by a NUL) that versions keep out, read as git writes them, so a long history needs no room for all of it. */
export function listKeptOut(cwd, args, { timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'safe.directory=*', ...args], {
      cwd, timeout, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const found = keptOutCollector();
    let errors = '';
    child.stdout.on('data', (chunk) => found.add(chunk));
    child.stderr.on('data', (chunk) => { errors = `${errors}${chunk}`.slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(found.names());
      else reject(Object.assign(new Error(errors.trim() || 'git failed'), { git: true, code }));
    });
  });
}

// How git log lists what each version changed, whatever the person's own git
// settings say: the first version and each merge's own changes too, the
// versions themselves (never stand-ins from git replace), plain names only.
const LOG_AS_IS = ['--no-replace-objects', '-c', 'log.showRoot=true', '-c', 'log.diffMerges=separate', '-c', 'log.showSignature=false', '-c', 'diff.relative=false'];

/** The files versions keep out that a version among `revs` (as git log takes them) added or changed, in the repository `top`, as git's own bytes. */
export const keptOutChangedIn = (top, revs, options) => listKeptOut(top, [...LOG_AS_IS, 'log', '-m', '--no-renames', '--diff-filter=d', '--name-only', '--format=', '-z', ...revs, '--'], options);

/**
 * A folder's changes (parsePorcelain) with the files versions keep out set
 * aside: `keptOut` names each such file that is new or changed on this
 * computer, which the next version leaves as it is. Deleting one stays a
 * change, which the next version makes.
 */
export function withKeptOutAside(found) {
  const kept = (c) => c.status !== 'deleted' && keptOutOfVersions(c.file);
  return { changes: found.filter((c) => !kept(c)), keptOut: [...new Set(found.filter(kept).map((c) => c.file))] };
}
