import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { projectStatus } from './git.js';
import { sendToGithub } from './publish.js';
import { fakeGithubRepos as fakeGithub } from '../../tests/fixtures/fakeGithubRepos.js';

// The version bar names the files that hold keys GitHub already has in its
// versions of a project (sent before such files were left out, or pushed by
// a terminal), since GitHub keeps them. All names, keys and repositories are
// made up.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-keeps-'));
const MADE_UP = ['-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...MADE_UP, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const write = (dir, rel, words = `${rel}: made-up words\n`) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), words);
};
/** Saves every file in `dir` as a version with plain git, files that hold keys and all, the way a terminal would. */
const saveWithPlainGit = (dir, message) => {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', message);
};
/** A made-up project a terminal saved with plain git, `.env` and all, and pushed to a made-up GitHub; `home` false leaves out censaiOS's note of its GitHub home. */
async function pushedByATerminal(gh, { home = true } = {}) {
  const dir = tmp();
  write(dir, 'index.html', 'Made-up page\n');
  write(dir, '.env', 'MADE_UP_KEY=not-a-real-made-up-key\n');
  git(dir, 'init', '-q', '-b', 'main');
  saveWithPlainGit(dir, 'Made-up first version');
  const { data } = await gh.repos.createForAuthenticatedUser({ name: `made-up-${path.basename(dir)}`, private: true });
  git(dir, 'remote', 'add', 'origin', data.clone_url);
  if (home) git(dir, 'config', 'censai.githubRepo', data.full_name);
  git(dir, 'push', '-q', '-u', 'origin', 'main');
  return dir;
}

describe('the version bar names the files that hold keys GitHub already has', () => {
  test('a project whose .env a terminal pushed to GitHub names it; one sent with none names nothing', async () => {
    const gh = fakeGithub(tmp());
    expect((await projectStatus(await pushedByATerminal(gh))).githubKeeps).toEqual(['.env']);

    const sent = tmp();
    write(sent, 'index.html', 'Made-up page\n');
    git(sent, 'init', '-q', '-b', 'main');
    saveWithPlainGit(sent, 'Made-up page only');
    write(sent, '.env', 'MADE_UP_KEY=not-a-real-made-up-key\n');
    const result = await sendToGithub(sent, { token: 'tok', title: 'Made-up page', author: { name: 'Alma', email: 'alma@example.com' }, repoName: 'made-up-sent', octokit: gh });
    expect(result.kind).toBe('created');
    const status = await projectStatus(sent);
    expect(status.keptOut).toEqual(['.env']);
    expect(status.githubKeeps).toEqual([]);
  });

  test('a key file a later version takes out is still named, since GitHub keeps every version it has', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    git(dir, 'rm', '-q', '--cached', '.env');
    git(dir, 'commit', '-qm', 'Made-up version without the .env');
    git(dir, 'push', '-q', 'origin', 'main');
    expect(git(dir, 'ls-tree', '-r', '--name-only', 'origin/main')).toBe('index.html');
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env']);
  });

  test('a key file pushed later, on another branch, is named once origin has it', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env']);
    git(dir, 'checkout', '-q', '-b', 'made-up-feature');
    write(dir, 'certs/made-up-server.key');
    saveWithPlainGit(dir, 'Made-up version with a key file');
    // Saved on this computer only: GitHub does not have it yet.
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env']);
    git(dir, 'push', '-q', 'origin', 'made-up-feature');
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env', 'certs/made-up-server.key']);
  });

  test('once seen, a key file stays named after the branch that held it is deleted on GitHub, since a pull request can keep it', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    git(dir, 'rm', '-q', '--cached', '.env');
    git(dir, 'commit', '-qm', 'Made-up version without the .env');
    git(dir, 'checkout', '-q', '-b', 'made-up-fix');
    write(dir, 'made-up-deploy.pem');
    saveWithPlainGit(dir, 'Made-up version with a key file');
    git(dir, 'push', '-q', 'origin', 'made-up-fix');
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env', 'made-up-deploy.pem']);
    expect(JSON.parse(git(dir, 'config', '--get', 'censai.githubKeeps'))).toEqual(['.env', 'made-up-deploy.pem']);
    // GitHub's main is pushed again as a new history without the .env, and the branch is deleted: no branch there holds either now.
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'reset', '-q', '--hard', git(dir, 'commit-tree', 'HEAD^{tree}', '-m', 'Made-up history without the .env'));
    git(dir, 'push', '-q', '--force', 'origin', 'main', ':made-up-fix');
    git(dir, 'fetch', '-q', '--prune', 'origin');
    expect(git(dir, 'ls-remote', 'origin', 'refs/heads/*').split('\n').map((line) => line.split('\t')[1])).toEqual(['refs/heads/main']);
    expect(git(dir, 'rev-list', '--count', '--remotes=origin')).toBe('1');
    expect((await projectStatus(dir)).githubKeeps).toEqual(['.env', 'made-up-deploy.pem']);
  });

  test("someone else's repository, a project with no GitHub home, or one never sent names nothing", async () => {
    const gh = fakeGithub(tmp());
    // A clone of a made-up stranger's repository: its remote is on github.com, but censaiOS never made it this folder's home.
    const clone = await pushedByATerminal(gh, { home: false });
    git(clone, 'remote', 'set-url', 'origin', 'https://github.com/made-up-owner/made-up-repo.git');
    const cloned = await projectStatus(clone);
    expect(cloned.githubRepo).toBe('made-up-owner/made-up-repo');
    expect(git(clone, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin')).toBe('refs/remotes/origin/main');
    expect(cloned.githubKeeps).toEqual([]);

    const elsewhere = await pushedByATerminal(gh, { home: false });
    const status = await projectStatus(elsewhere);
    expect(status.githubRepo).toBeNull();
    expect(status.githubKeeps).toEqual([]);

    const never = tmp();
    write(never, '.env', 'MADE_UP_KEY=not-a-real-made-up-key\n');
    git(never, 'init', '-q', '-b', 'main');
    saveWithPlainGit(never, 'Made-up version on this computer only');
    expect((await projectStatus(never)).githubKeeps).toEqual([]);
  });
});
