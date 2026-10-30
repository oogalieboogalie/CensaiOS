import { execFile } from 'child_process';
import { githubKeeps } from './githubKeeps.js';
import { listKeptOut, withKeptOutAside } from './keptOut.js';

// Plain git for one project folder on this computer: what changed, save a
// version (commit), start version saving (init). Every call runs git with
// the folder as its working directory and never through a shell. A file that
// holds keys or passwords is never saved in a version (./keptOut.js).

const GIT_TIMEOUT_MS = 60_000;

export function gitError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function runGit(cwd, args, { env = {}, timeout = GIT_TIMEOUT_MS, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', 'safe.directory=*', ...args], {
      cwd,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...env },
    }, (err, stdout, stderr) => {
      if (err) {
        const text = String(stderr || err.message || '').trim();
        return reject(Object.assign(new Error(text || 'git failed'), { git: true, code: err.code }));
      }
      resolve(String(stdout));
    });
    if (input !== undefined) {
      // A git that stops before reading what it is given still answers through its exit code.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
  });
}

async function quiet(cwd, args) {
  try { return (await runGit(cwd, args)).trim(); } catch { return null; }
}

const STATUS_WORDS = { M: 'changed', A: 'new', D: 'deleted', R: 'renamed', C: 'copied', '?': 'new', U: 'conflict' };

/** `git status --porcelain=v1 -z` in plain words: each path (from the repository's top) and how it changed. */
export function parsePorcelain(text) {
  const entries = String(text || '').split('\0');
  const found = [];
  for (let at = 0; at < entries.length; at += 1) {
    const entry = entries[at];
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    // A rename or a copy is followed by the path it was made from.
    if (/[RC]/.test(code)) at += 1;
    found.push({ file: entry.slice(3), status: STATUS_WORDS[code.trim()[0] || '?'] || 'changed' });
  }
  return found;
}

/** Everything the Files window's version bar shows, in plain fields. */
export async function projectStatus(cwd) {
  const top = await quiet(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return { tracked: false, changes: [], versions: [] };
  const branch = (await quiet(cwd, ['symbolic-ref', '--short', 'HEAD'])) || (await quiet(cwd, ['rev-parse', '--short', 'HEAD'])) || 'main';
  // Not trimmed: the first entry's leading space is part of its status code.
  const found = parsePorcelain(await runGit(cwd, ['status', '--porcelain=v1', '-z', '-uall']).catch(() => ''));
  const { changes, keptOut } = withKeptOutAside(found);
  const log = await quiet(cwd, ['log', '-n', '5', '--format=%h%x09%cr%x09%s']);
  const versions = (log || '').split('\n').filter(Boolean).map((l) => {
    const [id, when, ...rest] = l.split('\t');
    return { id, when, message: rest.join('\t') };
  });
  const remote = await quiet(cwd, ['remote', 'get-url', 'origin']);
  // The GitHub home censaiOS made for this folder (Send to GitHub's first send); else the one its remote names.
  const home = await quiet(cwd, ['config', '--get', 'censai.githubRepo']);
  const githubRepo = home || repoFromRemote(remote);
  let unsent = null;
  if (remote && versions.length) {
    const upstream = await quiet(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
    unsent = upstream ? Number(await quiet(cwd, ['rev-list', '--count', `${upstream}..HEAD`])) || 0 : versions.length;
  }
  // Files that hold keys GitHub keeps (./githubKeeps.js): only in the home censaiOS made, so never in someone else's repository.
  const onGithub = home && remote ? await keysOnGithub(top) : [];
  const folder = (await quiet(cwd, ['rev-parse', '--show-prefix'])) || '';
  return { tracked: true, root: top, partOfBigger: Boolean(folder), branch, changes, keptOut, githubKeeps: onGithub, versions, remote: remote ? redactRemote(remote) : null, githubRepo, unsent };
}

/** The files that hold keys GitHub keeps of this repository, kept in its settings (censai.githubKeeps) once seen, since GitHub keeps them. */
async function keysOnGithub(top) {
  let kept = [];
  try { kept = JSON.parse(await quiet(top, ['config', '--get', 'censai.githubKeeps']) || '[]'); } catch { /* none kept yet */ }
  return githubKeeps(top, {
    tips: await quiet(top, ['for-each-ref', '--format=%(objectname)', 'refs/remotes/origin']),
    kept: Array.isArray(kept) ? kept.filter((name) => typeof name === 'string') : [],
    keep: (names) => runGit(top, ['config', 'censai.githubKeeps', JSON.stringify(names)]),
  });
}

export function repoFromRemote(url) {
  const m = String(url || '').match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Never show a token that someone pasted into a remote address. */
export function redactRemote(url) {
  return String(url || '').replace(/\/\/[^@/\s]+@/, '//');
}

function authorEnv(author = {}) {
  const name = String(author.name || 'censaiOS').slice(0, 100);
  const email = String(author.email || 'board@censai.local').slice(0, 200);
  return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email };
}

/** Turn version saving on for a folder: git init on a `main` branch. */
export async function startVersions(cwd, { author } = {}) {
  if (await quiet(cwd, ['rev-parse', '--show-toplevel'])) return projectStatus(cwd);
  await runGit(cwd, ['init', '-q']);
  await runGit(cwd, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  await saveVersion(cwd, { message: 'First version', author, allowEmpty: true });
  return projectStatus(cwd);
}

/**
 * Leaves the files versions keep out (all through the repository) as the last
 * version holds them in what the next version takes in: a new one stays out,
 * and one an earlier version holds keeps that version's copy. The file itself
 * stays on this computer as it is. Names go to git as names, never patterns.
 */
async function leaveKeptOut(cwd) {
  const top = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
  const held = await listKeptOut(top, ['ls-files', '-z']);
  if (!held.length) return;
  await runGit(top, ['reset', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'], {
    env: { GIT_LITERAL_PATHSPECS: '1' }, input: Buffer.concat(held.flatMap((name) => [name, Buffer.from([0])])),
  });
}

/** Save every change in the folder as one version (git add -A + commit), leaving out the files versions keep out and changes to them. */
export async function saveVersion(cwd, { message, author, allowEmpty = false } = {}) {
  const text = String(message || '').trim().slice(0, 500) || 'Save a version';
  await runGit(cwd, ['add', '-A']);
  await leaveKeptOut(cwd);
  const staged = await quiet(cwd, ['diff', '--cached', '--name-only']);
  if (!staged && !allowEmpty) throw gitError('Nothing changed since the last saved version.');
  await runGit(cwd, ['commit', '-q', ...(allowEmpty ? ['--allow-empty'] : []), '-m', text], { env: authorEnv(author) });
  return projectStatus(cwd);
}
