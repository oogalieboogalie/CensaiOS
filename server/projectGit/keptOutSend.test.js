import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { startVersions } from './git.js';
import { sendToGithub } from './publish.js';
import { sendRefusal } from '../../shared/files/versionWords.js';
import { fakeGithubRepos as fakeGithub } from '../../tests/fixtures/fakeGithubRepos.js';

// Send to GitHub checks the versions it really sends against what GitHub
// really has, whatever the person's own git settings say: a repository made
// again since the last send, a version saved while GitHub answers, a
// submodule's versions. All names, keys and repositories are made up.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-send-'));
const MADE_UP = ['-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...MADE_UP, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const author = { name: 'Alma', email: 'alma@example.com' };
const write = (dir, rel, words = `${rel} not-a-real-made-up-key\n`) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), words);
};
/** A folder whose versions someone saved with plain git, files that hold keys and all. */
const savedWithPlainGit = (files, dir = tmp()) => {
  for (const file of files) write(dir, file);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'Made-up first version');
  return dir;
};
const send = (dir, gh, extra = {}) => sendToGithub(dir, { token: 'tok', title: 'Made-up page', author, repoName: 'made-up', octokit: gh, ...extra });
const refused = (names) => ({ status: 409, message: sendRefusal(names) });

/** A plain-git folder (.env and all) that GitHub got before this change, through its origin. */
async function sentBefore(gh) {
  const dir = savedWithPlainGit(['index.html', '.env']);
  const { data } = await gh.repos.createForAuthenticatedUser({ name: 'made-up', private: true });
  git(dir, 'remote', 'add', 'origin', data.clone_url);
  git(dir, 'config', 'censai.githubRepo', data.full_name);
  git(dir, 'push', '-q', 'origin', 'main');
  return dir;
}

describe('Send to GitHub goes by what GitHub has now', () => {
  test('a repository made again empty (to clear a key off GitHub) gets nothing back', async () => {
    const gh = fakeGithub(tmp());
    const dir = await sentBefore(gh);
    fs.rmSync(gh.repoDir('made-up'), { recursive: true, force: true });
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', gh.repoDir('made-up')]);
    write(dir, 'index.html', 'Made-up page, second version');
    await expect(send(dir, gh)).rejects.toMatchObject(refused(['.env']));
    expect(gh.pathsIn('made-up')).toEqual([]);
  });

  test('a version GitHub has is not counted again when this folder lost track of it', async () => {
    const gh = fakeGithub(tmp());
    const dir = await sentBefore(gh);
    // Taking the GitHub address off and putting it back forgets what was sent there.
    const url = git(dir, 'remote', 'get-url', 'origin');
    git(dir, 'remote', 'remove', 'origin');
    git(dir, 'remote', 'add', 'origin', url);
    // Someone else's version reaches GitHub's main branch meanwhile.
    const other = tmp();
    execFileSync('git', ['clone', '-q', gh.repoDir('made-up'), other]);
    write(other, 'README.md');
    git(other, 'add', '-A');
    git(other, 'commit', '-qm', 'Made-up version from someone else');
    git(other, 'push', '-q', 'origin', 'main');
    write(dir, 'index.html', 'Made-up page, second version');
    expect((await send(dir, gh)).kind).toBe('pull-request');
  });

  test('a version GitHub has on another branch is not counted again', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html');
    await startVersions(dir, { author });
    await send(dir, gh);
    // A terminal saves a .env and sends it to a branch of its own on GitHub.
    git(dir, 'checkout', '-q', '-b', 'made-up-branch');
    write(dir, '.env');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'Made-up version with a .env');
    git(dir, 'push', '-q', 'origin', 'made-up-branch');
    write(dir, 'index.html', 'Made-up page, second version');
    expect((await send(dir, gh)).kind).toBe('pull-request');
  });

  test("GitHub's main branch counts as sent even when this folder fetches only some of GitHub's branches", async () => {
    const gh = fakeGithub(tmp());
    const dir = await sentBefore(gh);
    git(dir, 'config', 'remote.origin.fetch', '+refs/heads/made-up-only/*:refs/remotes/origin/made-up-only/*');
    git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
    write(dir, 'index.html', 'Made-up page, second version');
    expect((await send(dir, gh)).kind).toBe('pull-request');
  });

  test('a version saved while GitHub answers is not sent unchecked', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html');
    await startVersions(dir, { author });
    const create = gh.repos.createForAuthenticatedUser;
    gh.repos.createForAuthenticatedUser = async (args) => {
      // A terminal saves a version with a key file in it just then.
      write(dir, 'deploy.key');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-qm', 'Made-up version with a key file');
      return create(args);
    };
    expect((await send(dir, gh)).kind).toBe('created');
    expect(gh.pathsIn('made-up')).toEqual(['index.html']);
  });

  test("a submodule's own versions are never sent along, whatever git is set to do", async () => {
    const gh = fakeGithub(tmp());
    const libHome = path.join(tmp(), 'made-up-lib.git');
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', libHome]);
    const seed = savedWithPlainGit(['lib.js']);
    git(seed, 'push', '-q', libHome, 'main');
    const dir = savedWithPlainGit(['index.html']);
    git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', libHome, 'lib');
    git(dir, 'commit', '-qm', 'Made-up lib');
    git(dir, 'config', 'push.recurseSubmodules', 'on-demand');
    git(dir, 'config', 'protocol.file.allow', 'always');
    // A .env saved in the submodule, which only its own home would get.
    write(path.join(dir, 'lib'), '.env');
    git(path.join(dir, 'lib'), 'add', '-A');
    git(path.join(dir, 'lib'), 'commit', '-qm', 'Made-up lib version with a .env');
    write(dir, 'index.html', 'Made-up page, second version');
    expect((await send(dir, gh)).kind).toBe('created');
    expect(git(libHome, 'ls-tree', '-r', '--name-only', 'main')).toBe('lib.js');
  });
});

describe("Send to GitHub reads every version as it is, whatever the person's git settings say", () => {
  test.each([
    ['the first version is not shown', ['log.showRoot', 'false']],
    ["a merge's own changes are not shown", ['log.diffMerges', 'off']],
    ['names are shown from the folder', ['diff.relative', 'true']],
    ['colors are always on', ['color.ui', 'always']],
  ])('%s', async (what, [key, value]) => {
    const gh = fakeGithub(tmp());
    const dir = savedWithPlainGit(['site/index.html', 'certs/server.key']);
    git(dir, 'checkout', '-q', '-b', 'side');
    write(dir, 'site/side.html');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'Made-up side version');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    write(dir, 'merge.key');
    git(dir, 'add', 'merge.key');
    git(dir, 'commit', '-qm', 'Made-up merge');
    git(dir, 'config', key, value);
    await expect(send(path.join(dir, 'site'), gh)).rejects.toMatchObject(refused(['merge.key', 'certs/server.key']));
    expect(gh.calls).toEqual([]);
  });

  test('a stand-in version (git replace) does not hide the one that would be sent', async () => {
    const gh = fakeGithub(tmp());
    const dir = savedWithPlainGit(['index.html', '.env']);
    const blob = git(dir, 'rev-parse', 'HEAD:index.html');
    const tree = execFileSync('git', ['-C', dir, 'mktree'], { input: `100644 blob ${blob}\tindex.html\n`, encoding: 'utf8' }).trim();
    git(dir, 'replace', git(dir, 'rev-parse', 'HEAD'), git(dir, 'commit-tree', tree, '-m', 'Made-up stand-in'));
    await expect(send(dir, gh)).rejects.toMatchObject(refused(['.env']));
    expect(gh.calls).toEqual([]);
  });

  // A made-up gpg that signs and calls every signature good, so git log can show signatures.
  const linuxOnly = process.platform === 'linux' ? test : test.skip;
  linuxOnly('signed versions shown with their signatures', async () => {
    const gh = fakeGithub(tmp());
    const gpg = path.join(tmp(), 'made-up-gpg.sh');
    fs.writeFileSync(gpg, [
      '#!/bin/sh',
      'case "$*" in *--verify*) cat >/dev/null',
      '  printf "[GNUPG:] NEWSIG\\n[GNUPG:] GOODSIG ABCDEF0123456789 Made Up <made-up@example.com>\\n[GNUPG:] TRUST_ULTIMATE 0 pgp\\n"',
      '  printf "gpg: Good signature from \\"Made Up <made-up@example.com>\\" [ultimate]\\n" >&2; exit 0;;',
      'esac',
      'cat >/dev/null',
      'printf "[GNUPG:] KEY_CONSIDERED X 0\\n[GNUPG:] SIG_CREATED D 22 8 00 1 ABC\\n" >&2',
      'printf -- "-----BEGIN PGP SIGNATURE-----\\n\\nbWFkZS11cA==\\n-----END PGP SIGNATURE-----\\n"',
      '',
    ].join('\n'));
    fs.chmodSync(gpg, 0o755);
    const dir = tmp();
    write(dir, 'index.html');
    write(dir, 'id_rsa');
    git(dir, 'init', '-q', '-b', 'main');
    for (const [key, value] of [['gpg.format', 'openpgp'], ['gpg.program', gpg], ['user.signingkey', '0123'], ['log.showSignature', 'true']]) git(dir, 'config', key, value);
    git(dir, 'add', '-A');
    execFileSync('git', ['-C', dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qS', '-m', 'Made-up signed version']);
    await expect(send(dir, gh)).rejects.toMatchObject(refused(['id_rsa']));
    expect(gh.calls).toEqual([]);
  });
});
