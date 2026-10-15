import { execFile } from 'child_process';

// Plain git for one project folder on this computer: what changed, save a
// version (commit), start version saving (init). Every call runs git with
// the folder as its working directory and never through a shell.

const GIT_TIMEOUT_MS = 60_000;

export function gitError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function runGit(cwd, args, { env = {}, timeout = GIT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-c', 'safe.directory=*', ...args], {
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
  });
}

async function quiet(cwd, args) {
  try { return (await runGit(cwd, args)).trim(); } catch { return null; }
}

const STATUS_WORDS = { M: 'changed', A: 'new', D: 'deleted', R: 'renamed', C: 'copied', '?': 'new', U: 'conflict' };

export function parsePorcelain(text) {
  return String(text || '').split('\n').filter(Boolean).map((line) => {
    const code = line.slice(0, 2);
    const file = line.slice(3).replace(/^.* -> /, '');
    const letter = code.trim()[0] || '?';
    return { file, status: STATUS_WORDS[letter] || 'changed' };
  });
}

/** Everything the Files window's version bar shows, in plain fields. */
export async function projectStatus(cwd) {
  const top = await quiet(cwd, ['rev-parse', '--show-toplevel']);
  if (!top) return { tracked: false, changes: [], versions: [] };
  const branch = (await quiet(cwd, ['symbolic-ref', '--short', 'HEAD'])) || (await quiet(cwd, ['rev-parse', '--short', 'HEAD'])) || 'main';
  // Not trimmed: the first line's leading space is part of its status code.
  const changes = parsePorcelain(await runGit(cwd, ['status', '--porcelain=v1', '-uall']).catch(() => ''));
  const log = await quiet(cwd, ['log', '-n', '5', '--format=%h%x09%cr%x09%s']);
  const versions = (log || '').split('\n').filter(Boolean).map((l) => {
    const [id, when, ...rest] = l.split('\t');
    return { id, when, message: rest.join('\t') };
  });
  const remote = await quiet(cwd, ['remote', 'get-url', 'origin']);
  const githubRepo = (await quiet(cwd, ['config', '--get', 'censai.githubRepo'])) || repoFromRemote(remote);
  let unsent = null;
  if (remote && versions.length) {
    const upstream = await quiet(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
    unsent = upstream ? Number(await quiet(cwd, ['rev-list', '--count', `${upstream}..HEAD`])) || 0 : versions.length;
  }
  const folder = (await quiet(cwd, ['rev-parse', '--show-prefix'])) || '';
  return { tracked: true, root: top, partOfBigger: Boolean(folder), branch, changes, versions, remote: remote ? redactRemote(remote) : null, githubRepo, unsent };
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

/** Save every change in the folder as one version (git add -A + commit). */
export async function saveVersion(cwd, { message, author, allowEmpty = false } = {}) {
  const text = String(message || '').trim().slice(0, 500) || 'Save a version';
  await runGit(cwd, ['add', '-A']);
  const staged = await quiet(cwd, ['diff', '--cached', '--name-only']);
  if (!staged && !allowEmpty) throw gitError('Nothing changed since the last saved version.');
  await runGit(cwd, ['commit', '-q', ...(allowEmpty ? ['--allow-empty'] : []), '-m', text], { env: authorEnv(author) });
  return projectStatus(cwd);
}
