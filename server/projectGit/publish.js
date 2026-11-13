import { Octokit } from '@octokit/rest';
import { sendRefusal } from '../../shared/files/versionWords.js';
import { createLogger } from '../logger.js';
import { githubApiUrl } from '../github/apiUrl.js';
import { gitError, projectStatus, runGit, saveVersion } from './git.js';
import { keptOutChangedIn, listKeptOut } from './keptOut.js';

// "Send to GitHub" from the Files window. A folder with no GitHub home gets
// a new private repository and its versions pushed there. A folder that
// already has one gets its unsent versions pushed to a new branch and a
// pull request opened against the main branch. The person's own GitHub
// token is used; it travels only to GitHub's own address, never to any
// other remote. Nothing is sent while the versions a send would add to GitHub
// hold a file that holds keys or passwords (./keptOut.js).

const log = createLogger('project-git');

const GIT_HOST = () => process.env.CENSAI_GITHUB_GIT_HOST || 'github.com';

export function slugify(text, fallback = 'project') {
  const slug = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug || fallback;
}

/** Git options that hand the token to GitHub only. */
export function authArgs(remoteUrl, token) {
  if (!token) return [];
  let host = '';
  try { host = new URL(remoteUrl).host; } catch { return []; }
  if (host.toLowerCase() !== GIT_HOST().toLowerCase()) return [];
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return ['-c', `http.https://${host}/.extraheader=AUTHORIZATION: basic ${basic}`];
}

// Only this repository's own versions: never a submodule's, whatever git is set to do.
async function push(cwd, remoteUrl, token, refspec) {
  try {
    await runGit(cwd, [...authArgs(remoteUrl, token), 'push', '-q', '--no-recurse-submodules', 'origin', refspec], { timeout: 120_000 });
  } catch (err) {
    throw gitError(`GitHub did not take the versions: ${String(err.message).split('\n').pop().slice(0, 200)}`, 502);
  }
}

/** Brings this repository's word of what GitHub has up to date: a repository made again or cleaned since counts as it is now. */
async function fetchWhatGithubHas(cwd, remoteUrl, token) {
  try {
    await runGit(cwd, [...authArgs(remoteUrl, token), 'fetch', '-q', '--prune', '--no-recurse-submodules', 'origin'], { timeout: 120_000 });
  } catch (err) {
    throw gitError(`GitHub did not answer: ${String(err.message).split('\n').pop().slice(0, 200)}`, 502);
  }
}

/** The files versions keep out that a version among `commits` (as git log takes them) added or changed, as git's own bytes. */
export async function keptOutAdded(cwd, commits) {
  const top = (await runGit(cwd, ['rev-parse', '--show-toplevel'])).trim();
  return keptOutChangedIn(top, commits);
}

/**
 * Of the versions GitHub has that a version among `commits` (as git rev-list
 * takes them) is made on, the files versions keep out that they hold, as
 * git's own bytes: the versions made again (./makeAgain.js) hold none of them.
 */
export async function keptOutGithubHolds(cwd, commits) {
  const lines = (await runGit(cwd, ['--no-replace-objects', 'rev-list', '--parents', ...commits])).split('\n').filter(Boolean).map((line) => line.split(' '));
  const own = new Set(lines.map(([sha]) => sha));
  const found = new Map();
  for (const sha of new Set(lines.flatMap(([, ...parents]) => parents).filter((parent) => !own.has(parent)))) {
    for (const name of await listKeptOut(cwd, ['--no-replace-objects', 'ls-tree', '-r', '-z', '--name-only', '--full-tree', sha])) found.set(name.toString('latin1'), name);
  }
  return [...found.values()];
}

/**
 * Stops a send when a version from `head` that GitHub does not have yet (it
 * has `sent`, its main branch at `baseSha`) added or changed a file that
 * versions keep out, so the person can have them made again
 * (./makeAgain.js): names those files (`keptOut`), the ones the versions
 * GitHub has hold (`githubHas`) and of those the ones its main branch holds
 * too (`onMain`, which merging the versions made again takes out of it),
 * and counts the versions.
 */
async function refuseKeptOut(cwd, head, sent, baseSha = null) {
  const commits = sent.length ? [head, '--not', ...sent] : [head];
  const held = await keptOutAdded(cwd, commits);
  if (!held.length) return;
  log.warn('send to GitHub refused: saved versions hold files that can hold keys', { files: held.length });
  const words = (names) => names.map((name) => name.toString('utf8'));
  const githubHas = sent.length ? words(await keptOutGithubHolds(cwd, commits)) : [];
  const mainHas = githubHas.length && sent.includes(baseSha)
    ? new Set(words(await listKeptOut(cwd, ['--no-replace-objects', 'ls-tree', '-r', '-z', '--name-only', '--full-tree', baseSha]))) : new Set();
  const versions = Number(await runGit(cwd, ['--no-replace-objects', 'rev-list', '--count', ...commits])) || 0;
  throw Object.assign(gitError(sendRefusal(words(held)), 409), { keptOut: words(held), githubHas, onMain: githubHas.filter((name) => mainHas.has(name)), versions });
}

/** True when this repository has `sha`, a commit GitHub named. */
async function hasCommit(cwd, sha) {
  if (!/^[0-9a-f]{40,64}$/i.test(String(sha))) return false;
  return runGit(cwd, ['cat-file', '-e', `${sha}^{commit}`]).then(() => true, () => false);
}

/**
 * What GitHub has of this folder's versions, as GitHub says now: nothing while
 * the folder has no GitHub home (`repo` null); else its repository, its main
 * branch (`base`, at `baseSha`, null while it is empty) and `sent`, the
 * versions GitHub has, as git log takes them after --not.
 */
export async function whatGithubHas(cwd, status, { token, gh }) {
  const repo = status.githubRepo;
  const remoteUrl = status.remote ? (await runGit(cwd, ['remote', 'get-url', 'origin'])).trim() : null;
  if (!repo && remoteUrl) throw gitError('This folder already sends its versions somewhere other than GitHub.');
  if (!repo) return { repo: null, sent: [] };
  if (!token) throw gitError('Connect GitHub first: paste a GitHub token in the GitHub window (Add > GitHub).', 401);
  const { data: info } = await gh.repos.get({ owner: repo.split('/')[0], repo: repo.split('/')[1] });
  const base = info.default_branch || 'main';
  let baseSha = null;
  try {
    const { data: ref } = await gh.git.getRef({ owner: info.owner.login, repo: info.name, ref: `heads/${base}` });
    baseSha = ref.object.sha;
  } catch (err) {
    // 409 / 404: an empty repository, so the first push makes the main
    // branch. Anything else (no access, GitHub down) stops here.
    if (err?.status !== 404 && err?.status !== 409) throw gitError(`GitHub said: ${err.message}`, 502);
  }
  // What GitHub has already (every branch there, and its main branch) is not sent again.
  await fetchWhatGithubHas(cwd, remoteUrl, token);
  return { repo, remoteUrl, info, base, baseSha, sent: ['--remotes=origin', ...(baseSha && await hasCommit(cwd, baseSha) ? [baseSha] : [])] };
}

export const githubClient = (token, octokit) => octokit || new Octokit({ auth: token, userAgent: 'Censai-App', baseUrl: githubApiUrl() });

export async function sendToGithub(cwd, { token, title, body, author, repoName, octokit } = {}) {
  if (!token) throw gitError('Connect GitHub first: paste a GitHub token in the GitHub window (Add > GitHub).', 401);
  const gh = githubClient(token, octokit);
  let status = await projectStatus(cwd);
  if (!status.tracked) throw gitError('Start saving versions for this folder first.');
  const heading = String(title || '').trim().slice(0, 200) || `Changes from censaiOS`;
  if (status.changes.length) status = await saveVersion(cwd, { message: heading, author });
  // The version checked is the version sent, whatever is saved in the folder meanwhile.
  const head = (await runGit(cwd, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']).catch(() => '')).trim();
  if (!head) throw gitError('Save a version first: there is nothing to send yet.');

  const home = await whatGithubHas(cwd, status, { token, gh });
  if (!home.repo) {
    await refuseKeptOut(cwd, head, []);
    const { data } = await gh.repos.createForAuthenticatedUser({
      name: slugify(repoName || status.root.split(/[\\/]/).pop()), private: true, auto_init: false,
    });
    await runGit(cwd, ['remote', 'add', 'origin', data.clone_url]);
    await runGit(cwd, ['config', 'censai.githubRepo', data.full_name]);
    await push(cwd, data.clone_url, token, `${head}:refs/heads/${status.branch}`);
    return { kind: 'created', repo: data.full_name, url: data.html_url, branch: status.branch, status: await projectStatus(cwd) };
  }

  const { repo, remoteUrl, info, base, baseSha, sent } = home;
  await refuseKeptOut(cwd, head, sent, baseSha);
  if (!baseSha) {
    await push(cwd, remoteUrl, token, `${head}:refs/heads/${base}`);
    return { kind: 'created', repo, url: info.html_url, branch: base, status: await projectStatus(cwd) };
  }
  if (head === baseSha) throw gitError('Nothing new to send: GitHub already has every saved version.');
  const branch = `censai/${slugify(heading, 'changes')}-${head.slice(0, 7)}`;
  await push(cwd, remoteUrl, token, `${head}:refs/heads/${branch}`);
  const { data: pr } = await gh.pulls.create({
    owner: info.owner.login, repo: info.name, head: branch, base, title: heading,
    body: String(body || '').trim() || 'Sent from censaiOS.',
  });
  await runGit(cwd, [...authArgs(remoteUrl, token), 'fetch', '-q', 'origin']).catch(() => {});
  return { kind: 'pull-request', repo, url: pr.html_url, number: pr.number, branch, status: await projectStatus(cwd) };
}

