import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// A made-up GitHub that only knows the calls "Send to GitHub" makes
// (server/projectGit/publish.js), and a repo's files and issues as an agent
// or a GitHub project reads and writes them (server/github.js), shaped like
// Octokit. Its repositories are bare repositories on disk under `root`, so
// pushes to them are real.

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const MADE_UP_AUTHOR = { GIT_AUTHOR_NAME: 'Made-up GitHub', GIT_AUTHOR_EMAIL: 'made-up@example.invalid', GIT_COMMITTER_NAME: 'Made-up GitHub', GIT_COMMITTER_EMAIL: 'made-up@example.invalid' };

/** The files and folders in the folder `tree` (at `folder`) of the repository `dir`, as GitHub's contents API lists them. */
function listFolder(dir, tree, folder) {
  return git(dir, 'ls-tree', '-l', tree).split('\n').filter(Boolean).map((line) => {
    const [info, name] = line.split('\t');
    const [, type, sha, size] = info.split(/\s+/);
    return { type: type === 'tree' ? 'dir' : 'file', name, path: folder ? `${folder}/${name}` : name, sha, size: Number(size) || 0 };
  });
}

/** Commits `files` ({ path: words }) onto `branch` of the bare repository `dir`; returns the new version's sha. */
function commitFiles(dir, branch, files, message) {
  const index = path.join(dir, `made-up-index-${process.pid}-${Date.now()}`);
  const env = { ...process.env, ...MADE_UP_AUTHOR, GIT_INDEX_FILE: index };
  const run = (args, input) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env, input }).trim();
  let parent = '';
  try { parent = run(['rev-parse', '--verify', '-q', `refs/heads/${branch}`]); } catch { /* a new branch */ }
  try {
    if (parent) run(['read-tree', parent]);
    for (const [file, words] of Object.entries(files)) {
      const blob = run(['hash-object', '-w', '--stdin'], words);
      run(['update-index', '--add', '--cacheinfo', `100644,${blob},${file}`]);
    }
    const commit = run(['commit-tree', run(['write-tree']), ...(parent ? ['-p', parent] : []), '-m', message]);
    run(['update-ref', `refs/heads/${branch}`, commit]);
    return commit;
  } finally {
    fs.rmSync(index, { force: true });
  }
}

export function fakeGithubRepos(root, { owner = 'alma' } = {}) {
  const calls = [];
  const repoDir = (name) => path.join(root, `${name}.git`);
  const repo = (name) => ({
    full_name: `${owner}/${name}`, name, owner: { login: owner }, default_branch: 'main',
    html_url: `https://github.com/${owner}/${name}`, clone_url: `file://${repoDir(name)}`,
  });
  const exists = (name) => {
    try {
      git(repoDir(name), 'rev-parse', '--git-dir');
      return true;
    } catch {
      return false;
    }
  };
  const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
  const issuesOf = new Map();
  return {
    calls,
    repoDir,
    /** Makes the made-up repository `name` holding `files` ({ path: words }) and `issues`. */
    seed(name, files, { issues = [] } = {}) {
      execFileSync('git', ['init', '-q', '--bare', '-b', 'main', repoDir(name)]);
      commitFiles(repoDir(name), 'main', files, 'Made-up first version');
      issuesOf.set(name, issues);
    },
    /** Every path any commit on any branch of the made-up repository `name` holds. */
    pathsIn(name) {
      const commits = git(repoDir(name), 'rev-list', '--all').split('\n').filter(Boolean);
      return [...new Set(commits.flatMap((sha) => git(repoDir(name), 'ls-tree', '-r', '--name-only', '-z', sha).split('\0')).filter(Boolean))];
    },
    repos: {
      createForAuthenticatedUser: async ({ name, private: isPrivate }) => {
        calls.push(['create', name, isPrivate]);
        execFileSync('git', ['init', '-q', '--bare', '-b', 'main', repoDir(name)]);
        return { data: repo(name) };
      },
      get: async ({ repo: name }) => {
        if (!exists(name)) throw notFound();
        return { data: repo(name) };
      },
      getContent: async ({ repo: name, path: file = '', ref = 'main' }) => {
        let sha;
        try {
          sha = git(repoDir(name), 'rev-parse', '--verify', '-q', `${ref}:${file}`);
        } catch {
          throw notFound();
        }
        const kind = git(repoDir(name), 'cat-file', '-t', sha);
        // A folder: its files and folders, as GitHub lists them.
        if (kind === 'tree') return { data: listFolder(repoDir(name), sha, file) };
        if (kind !== 'blob') throw notFound();
        const content = execFileSync('git', ['-C', repoDir(name), 'cat-file', 'blob', sha]).toString('base64');
        return { data: { type: 'file', name: path.basename(file), path: file, sha, encoding: 'base64', content } };
      },
      createOrUpdateFileContents: async ({ repo: name, path: file, message, content, branch = 'main' }) => {
        if (!exists(name)) throw notFound();
        calls.push(['write', name, file]);
        const sha = commitFiles(repoDir(name), branch, { [file]: Buffer.from(content, 'base64') }, message);
        return { data: { content: { path: file }, commit: { sha, html_url: `https://github.com/${owner}/${name}/commit/${sha}` } } };
      },
    },
    issues: {
      listForRepo: async ({ repo: name }) => {
        if (!exists(name)) throw notFound();
        return { data: issuesOf.get(name) || [] };
      },
    },
    git: {
      getRef: async ({ repo: name, ref }) => {
        try {
          const sha = git(repoDir(name), 'rev-parse', '--verify', '-q', `refs/${ref}`);
          return { data: { object: { sha } } };
        } catch {
          throw notFound();
        }
      },
      getTree: async ({ repo: name, tree_sha: sha }) => {
        let lines;
        try {
          lines = git(repoDir(name), 'ls-tree', '-r', '-t', '-l', sha).split('\n').filter(Boolean);
        } catch {
          throw notFound();
        }
        const tree = lines.map((line) => {
          const [info, file] = line.split('\t');
          const [, type, blobSha, size] = info.split(/\s+/);
          return { path: file, type, sha: blobSha, ...(type === 'blob' ? { size: Number(size) } : {}) };
        });
        return { data: { sha, tree, truncated: false } };
      },
    },
    pulls: {
      create: async (pr) => {
        calls.push(['pr', pr.head, pr.base, pr.title]);
        return { data: { number: 7, html_url: `https://github.com/${owner}/${pr.repo}/pull/7` } };
      },
    },
  };
}
