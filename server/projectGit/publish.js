import { Octokit } from '@octokit/rest';
import { gitError, projectStatus, runGit, saveVersion } from './git.js';

// "Send to GitHub" from the Files window. A folder with no GitHub home gets
// a new private repository and its versions pushed there. A folder that
// already has one gets its unsent versions pushed to a new branch and a
// pull request opened against the main branch. The person's own GitHub
// token is used; it travels only to GitHub's own address, never to any
// other remote.

const API_URL = () => process.env.CENSAI_GITHUB_API_URL || 'https://api.github.com';
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

async function push(cwd, remoteUrl, token, refspec) {
  try {
    await runGit(cwd, [...authArgs(remoteUrl, token), 'push', '-q', 'origin', refspec], { timeout: 120_000 });
  } catch (err) {
    throw gitError(`GitHub did not take the versions: ${String(err.message).split('\n').pop().slice(0, 200)}`, 502);
  }
}

export async function sendToGithub(cwd, { token, title, body, author, repoName, octokit } = {}) {
  if (!token) throw gitError('Connect GitHub first: paste a GitHub token in the GitHub window (Add > GitHub).', 401);
  const gh = octokit || new Octokit({ auth: token, userAgent: 'Censai-App', baseUrl: API_URL() });
  let status = await projectStatus(cwd);
  if (!status.tracked) throw gitError('Start saving versions for this folder first.');
  const heading = String(title || '').trim().slice(0, 200) || `Changes from censaiOS`;
  if (status.changes.length) status = await saveVersion(cwd, { message: heading, author });

  let repo = status.githubRepo;
  let remoteUrl = status.remote ? (await runGit(cwd, ['remote', 'get-url', 'origin'])).trim() : null;
  if (!repo && remoteUrl) throw gitError('This folder already sends its versions somewhere other than GitHub.');
  if (!repo) {
    const { data } = await gh.repos.createForAuthenticatedUser({
      name: slugify(repoName || status.root.split(/[\\/]/).pop()), private: true, auto_init: false,
    });
    repo = data.full_name;
    remoteUrl = data.clone_url;
    await runGit(cwd, ['remote', 'add', 'origin', remoteUrl]);
    await runGit(cwd, ['config', 'censai.githubRepo', repo]);
    await push(cwd, remoteUrl, token, `HEAD:refs/heads/${status.branch}`);
    return { kind: 'created', repo, url: data.html_url, branch: status.branch, status: await projectStatus(cwd) };
  }

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
  if (!baseSha) {
    await push(cwd, remoteUrl, token, `HEAD:refs/heads/${base}`);
    return { kind: 'created', repo, url: info.html_url, branch: base, status: await projectStatus(cwd) };
  }
  const head = (await runGit(cwd, ['rev-parse', 'HEAD'])).trim();
  if (head === baseSha) throw gitError('Nothing new to send: GitHub already has every saved version.');
  const branch = `censai/${slugify(heading, 'changes')}-${head.slice(0, 7)}`;
  await push(cwd, remoteUrl, token, `HEAD:refs/heads/${branch}`);
  const { data: pr } = await gh.pulls.create({
    owner: info.owner.login, repo: info.name, head: branch, base, title: heading,
    body: String(body || '').trim() || 'Sent from censaiOS.',
  });
  await runGit(cwd, [...authArgs(remoteUrl, token), 'fetch', '-q', 'origin']).catch(() => {});
  return { kind: 'pull-request', repo, url: pr.html_url, number: pr.number, branch, status: await projectStatus(cwd) };
}

