import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { projectStatus } from './git.js';
import { markNewKeys } from './newKeys.js';
import { fakeGithubRepos as fakeGithub } from '../../tests/fixtures/fakeGithubRepos.js';

// "Done, I made new keys" on the version bar's "GitHub already has" line puts
// it away for the files it names; a key file GitHub gets later, or a new copy
// of one put away, brings the line back. All names, keys and repositories are
// made up.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-newkeys-'));
const MADE_UP = ['-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...MADE_UP, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const write = (dir, rel, words = `${rel}: made-up words\n`) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), words);
};
/** Saves `files` as a version with plain git, key files and all, the way a terminal would. */
const saveWithPlainGit = (dir, message, files = ['-A']) => {
  git(dir, 'add', ...files);
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
const named = async (dir) => (await projectStatus(dir)).githubKeeps;
const putAway = (dir) => JSON.parse(git(dir, 'config', '--get', 'censai.githubKeepsDone'));

describe('"Done, I made new keys" puts the "GitHub already has" line away', () => {
  test('the line goes for the files it names, and a later look (what a reload asks) keeps it away', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    expect(await named(dir)).toEqual(['.env']);
    const status = await markNewKeys(dir, ['.env']);
    expect(status.tracked).toBe(true);
    expect(status.githubKeeps).toEqual([]);
    expect(await named(dir)).toEqual([]);
    expect(putAway(dir)).toEqual({ names: ['.env'], since: [git(dir, 'rev-parse', 'origin/main')] });
    // The file itself stays on this computer as it is.
    expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).toBe('MADE_UP_KEY=not-a-real-made-up-key\n');
  });

  test('a key file GitHub gets later brings the line back naming only it; a new copy of the .env brings it back too, for good', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    await markNewKeys(dir, ['.env']);
    git(dir, 'checkout', '-q', '-b', 'made-up-feature');
    write(dir, 'certs/made-up-server.key');
    saveWithPlainGit(dir, 'Made-up version with a key file');
    // Saved on this computer only: GitHub does not have it yet.
    expect(await named(dir)).toEqual([]);
    git(dir, 'push', '-q', 'origin', 'made-up-feature');
    expect(await named(dir)).toEqual(['certs/made-up-server.key']);

    write(dir, '.env', 'MADE_UP_KEY=a-new-made-up-key\n');
    saveWithPlainGit(dir, 'Made-up version with a new copy of the .env', ['.env']);
    expect(await named(dir)).toEqual(['certs/made-up-server.key']);
    git(dir, 'push', '-q', 'origin', 'made-up-feature');
    expect(await named(dir)).toEqual(['.env', 'certs/made-up-server.key']);
    expect(putAway(dir).names).toEqual([]);

    // GitHub keeps them once the branch is deleted there.
    git(dir, 'push', '-q', 'origin', ':made-up-feature');
    git(dir, 'fetch', '-q', '--prune', 'origin');
    expect(await named(dir)).toEqual(['.env', 'certs/made-up-server.key']);

    // Put away again, both stay away until GitHub gets something new.
    expect((await markNewKeys(dir, ['.env', 'certs/made-up-server.key'])).githubKeeps).toEqual([]);
    expect(await named(dir)).toEqual([]);
  });

  test('only the files the line names now are put away, and a Done for some leaves the rest named', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    git(dir, 'checkout', '-q', '-b', 'made-up-feature');
    write(dir, 'made-up-deploy.pem');
    saveWithPlainGit(dir, 'Made-up version with a key file');
    git(dir, 'push', '-q', 'origin', 'made-up-feature');
    expect(await named(dir)).toEqual(['.env', 'made-up-deploy.pem']);
    for (const names of [['made-up-other.key', 'index.html', 42, null], 'not-a-list', undefined]) {
      expect((await markNewKeys(dir, names)).githubKeeps).toEqual(['.env', 'made-up-deploy.pem']);
    }
    expect(() => putAway(dir)).toThrow();
    expect((await markNewKeys(dir, ['made-up-deploy.pem'])).githubKeeps).toEqual(['.env']);
    expect((await markNewKeys(dir, ['.env'])).githubKeeps).toEqual([]);
    expect(putAway(dir).names).toEqual(['.env', 'made-up-deploy.pem']);
  });

  test("someone else's repository, a project censaiOS never sent, or a folder without versions is refused", async () => {
    const gh = fakeGithub(tmp());
    const clone = await pushedByATerminal(gh, { home: false });
    await expect(markNewKeys(clone, ['.env'])).rejects.toMatchObject({ status: 409 });

    const never = tmp();
    write(never, '.env', 'MADE_UP_KEY=not-a-real-made-up-key\n');
    git(never, 'init', '-q', '-b', 'main');
    saveWithPlainGit(never, 'Made-up version on this computer only');
    await expect(markNewKeys(never, ['.env'])).rejects.toMatchObject({ status: 409 });

    await expect(markNewKeys(tmp(), ['.env'])).rejects.toMatchObject({ status: 400, message: 'Versions are off for this folder.' });
  });

  test('settings someone else wrote reach git only as version ids, and never hide a file GitHub keeps', async () => {
    const dir = await pushedByATerminal(fakeGithub(tmp()));
    const out = path.join(tmp(), 'made-up-output.txt');
    git(dir, 'config', 'censai.githubKeepsDone', JSON.stringify({ names: ['.env'], since: [`--output=${out}`, 'HEAD', 'not-a-version'] }));
    // With no version of then to stand on, every version GitHub has counts as after it.
    expect(await named(dir)).toEqual(['.env']);
    expect(fs.existsSync(out)).toBe(false);
    expect(putAway(dir)).toEqual({ names: [], since: [] });
    git(dir, 'config', 'censai.githubKeepsDone', 'not json');
    expect(await named(dir)).toEqual(['.env']);
  });
});
