import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { projectStatus } from './git.js';
import { keptOutOfVersions } from './keptOut.js';
import { sendToGithub } from './publish.js';
import { makeVersionsAgain, unquotedPath, withoutKeptOut } from './makeAgain.js';
import { fakeGithubRepos as fakeGithub } from '../../tests/fixtures/fakeGithubRepos.js';

// Send to GitHub refuses while the versions it would add hold a file that
// holds keys; "make them again" makes those versions again without such
// files and leaves versions GitHub has as they are. All names, keys and
// repositories are made up.

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-again-'));
const MADE_UP = ['-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', '-c', 'commit.gpgsign=false'];
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...MADE_UP, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const author = { name: 'Alma', email: 'alma@example.com' };
const KEY = 'not-a-real-made-up-key-again';
const write = (dir, rel, words = `${rel} ${KEY}\n`) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), words);
};
/** Saves every file in `dir` as a version with plain git, files that hold keys and all, at a made-up time. */
const saveWithPlainGit = (dir, message, when = '2026-01-02T03:04:05Z') => {
  git(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, ...MADE_UP, 'commit', '-qm', message], { env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } });
};
const sorted = (list) => [...list].sort();
const filesAt = (dir, rev) => sorted(git(dir, 'ls-tree', '-r', '--name-only', '-z', rev).split('\0').filter(Boolean));
/** Every file any version on the branch holds. */
const everFiles = (dir) => sorted(new Set(git(dir, 'rev-list', 'HEAD').split('\n').flatMap((sha) => filesAt(dir, sha))));
const versions = (dir, range = 'HEAD') => git(dir, 'log', '--format=%s|%an|%ae|%aI|%cn|%cI', range).split('\n');
/** Each version's files but the ones versions keep out ("mode type object<TAB>path"), by its message. */
const ordinaryFiles = (dir) => new Map(git(dir, 'log', '--format=%H %s').split('\n').map((line) => [
  line.slice(41), git(dir, 'ls-tree', '-r', '-z', '--full-tree', line.slice(0, 40)).split('\0').filter((entry) => entry && !keptOutOfVersions(entry.split('\t')[1])).sort(),
]));
const send = (dir, gh) => sendToGithub(dir, { token: 'tok', title: 'Made-up page', author, repoName: 'made-up', octokit: gh });

describe('making the versions GitHub does not have yet again without files that hold keys', () => {
  test('a project saved with plain git, .env and all, is made again without them and then sent; the files and unsaved changes stay', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html', 'Made-up page\n');
    for (const file of ['.env', 'certs/server.key']) write(dir, file);
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version', '2026-01-02T03:04:05Z');
    write(dir, 'index.html', 'Made-up page, second version');
    write(dir, '.env', `MADE_UP_KEY=${KEY}-changed\n`);
    saveWithPlainGit(dir, 'Made-up second version', '2026-01-03T03:04:05Z');
    const before = versions(dir);
    write(dir, 'index.html', 'Made-up page, not saved yet');

    const result = await makeVersionsAgain(dir, { token: 'tok', octokit: gh });
    expect(result).toMatchObject({ made: 2, files: ['.env', 'certs/server.key'] });
    expect(versions(dir)).toEqual(before);
    expect(everFiles(dir)).toEqual(['index.html']);
    expect(git(dir, 'show', 'HEAD:index.html')).toBe('Made-up page, second version');
    // The files themselves, and a change not saved yet, stay as they were.
    expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).toBe(`MADE_UP_KEY=${KEY}-changed\n`);
    expect(fs.readFileSync(path.join(dir, 'certs/server.key'), 'utf8')).toContain(KEY);
    expect(result.status).toMatchObject({ changes: [{ file: 'index.html', status: 'changed' }], keptOut: ['.env', 'certs/server.key'] });
    expect(git(dir, 'show-ref')).not.toContain('made-again');

    expect((await send(dir, gh)).kind).toBe('created');
    expect(gh.pathsIn('made-up')).toEqual(['index.html']);
    expect(git(gh.repoDir('made-up'), 'log', '--all', '-p')).not.toContain(KEY);
  });

  test('versions GitHub has stay as they are, and a version made on one that holds a .env or a certificate takes them out', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html', 'Made-up page\n');
    write(dir, '.env');
    write(dir, 'server.crt');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    const { data } = await gh.repos.createForAuthenticatedUser({ name: 'made-up', private: true });
    git(dir, 'remote', 'add', 'origin', data.clone_url);
    git(dir, 'config', 'censai.githubRepo', data.full_name);
    git(dir, 'push', '-q', 'origin', 'main');
    const onGithub = git(dir, 'rev-parse', 'HEAD');
    write(dir, 'index.html', 'Made-up page, second version');
    write(dir, '.env', `MADE_UP_KEY=${KEY}-changed\n`);
    write(dir, 'deploy/made-up-deploy.key');
    saveWithPlainGit(dir, 'Made-up second version');
    await expect(send(dir, gh)).rejects.toMatchObject({ status: 409, keptOut: ['.env', 'deploy/made-up-deploy.key'], githubHas: ['.env', 'server.crt'], onMain: ['.env', 'server.crt'], versions: 1 });

    expect(await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).toMatchObject({ made: 1, files: ['.env', 'deploy/made-up-deploy.key', 'server.crt'] });
    expect(git(dir, 'rev-parse', 'HEAD^')).toBe(onGithub);
    expect(git(gh.repoDir('made-up'), 'rev-parse', 'main')).toBe(onGithub);
    expect(filesAt(gh.repoDir('made-up'), 'main')).toEqual(['.env', 'index.html', 'server.crt']);
    expect(filesAt(dir, 'HEAD')).toEqual(['index.html']);
    expect(fs.readFileSync(path.join(dir, 'server.crt'), 'utf8')).toContain(KEY);
    const sent = await send(dir, gh);
    expect(sent.kind).toBe('pull-request');
    expect(filesAt(gh.repoDir('made-up'), sent.branch)).toEqual(['index.html']);
    expect(git(gh.repoDir('made-up'), 'log', '-p', `main..${sent.branch}`)).not.toContain(`${KEY}-changed`);
  });

  test("the refusal tells the files GitHub's main branch holds from the ones only another GitHub branch holds", async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html', 'Made-up page\n');
    write(dir, '.env');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    const { data } = await gh.repos.createForAuthenticatedUser({ name: 'made-up', private: true });
    git(dir, 'remote', 'add', 'origin', data.clone_url);
    git(dir, 'config', 'censai.githubRepo', data.full_name);
    git(dir, 'push', '-q', 'origin', 'main');
    git(dir, 'checkout', '-q', '-b', 'made-up-feature');
    write(dir, 'feature.pem');
    saveWithPlainGit(dir, 'Made-up feature version');
    git(dir, 'push', '-q', 'origin', 'made-up-feature');
    const feature = git(dir, 'rev-parse', 'HEAD');
    write(dir, '.env', `MADE_UP_KEY=${KEY}-changed\n`);
    saveWithPlainGit(dir, 'Made-up second feature version');
    await expect(send(dir, gh)).rejects.toMatchObject({ status: 409, keptOut: ['.env'], githubHas: ['.env', 'feature.pem'], onMain: ['.env'], versions: 1 });

    expect(await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).toMatchObject({ made: 1, files: ['.env', 'feature.pem'] });
    expect(git(dir, 'rev-parse', 'HEAD^')).toBe(feature);
    expect(filesAt(gh.repoDir('made-up'), 'made-up-feature')).toEqual(['.env', 'feature.pem', 'index.html']);
    const sent = await send(dir, gh);
    expect(sent.kind).toBe('pull-request');
    expect(filesAt(gh.repoDir('made-up'), sent.branch)).toEqual(['index.html']);
  });

  test('a merge whose side brings a key file in is made again without it, with both its parents', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    git(dir, 'checkout', '-q', '-b', 'side');
    write(dir, 'side.html');
    write(dir, 'merge.key');
    saveWithPlainGit(dir, 'Made-up side version');
    git(dir, 'checkout', '-q', 'main');
    write(dir, 'index.html', 'Made-up page, second version');
    saveWithPlainGit(dir, 'Made-up second version');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'Made-up merge', 'side');
    expect(await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).toMatchObject({ made: 4, files: ['merge.key'] });
    expect(git(dir, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
    expect(filesAt(dir, 'HEAD')).toEqual(['index.html', 'side.html']);
    expect(everFiles(dir)).not.toContain('merge.key');
    expect((await send(dir, gh)).kind).toBe('created');
  });

  test('a file or a link that turns into a folder, and a name whose letters change case, keep every other file in every version', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    git(dir, 'init', '-q', '-b', 'main');
    write(dir, 'notes', 'Made-up notes\n');
    write(dir, 'Readme.md', 'Made-up readme\n');
    write(dir, '.env');
    const links = process.platform !== 'win32';
    if (links) fs.symlinkSync('made-up-target', path.join(dir, 'site'));
    saveWithPlainGit(dir, 'Made-up first version');
    fs.rmSync(path.join(dir, 'notes'));
    write(dir, 'notes/todo.txt', 'Made-up to-do\n');
    if (links) {
      fs.rmSync(path.join(dir, 'site'));
      write(dir, 'site/page.html', 'Made-up page\n');
    }
    fs.renameSync(path.join(dir, 'Readme.md'), path.join(dir, 'README.md'));
    saveWithPlainGit(dir, 'Made-up second version');
    fs.rmSync(path.join(dir, 'notes'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.renameSync(path.join(dir, 'README.md'), path.join(dir, 'docs/README.md'));
    saveWithPlainGit(dir, 'Made-up third version');
    // On Windows and macOS git takes names whatever their letters' case.
    git(dir, 'config', 'core.ignorecase', 'true');
    const before = ordinaryFiles(dir);
    expect(await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).toMatchObject({ made: 3, files: ['.env'] });
    expect(ordinaryFiles(dir)).toEqual(before);
    expect(before.get('Made-up second version').some((entry) => entry.endsWith('\tnotes/todo.txt'))).toBe(true);
    expect(everFiles(dir)).not.toContain('.env');
  });

  test('names with spaces, quotes and letters that are not ASCII are taken out too; a message that reads like a file line stays', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    const odd = ['made up keys/made up.pem', 'quote"d.key', 'clé-made-up.pem', 'back\\slash.key'];
    for (const file of ['index.html', ...odd]) write(dir, file);
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version\n\nM 100644 0123456789abcdef0123456789abcdef01234567 index.html\ndata 3');
    const message = git(dir, 'log', '-1', '--format=%B');
    expect((await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).made).toBe(1);
    expect(filesAt(dir, 'HEAD')).toEqual(['index.html']);
    expect(git(dir, 'log', '-1', '--format=%B')).toBe(message);
    for (const file of odd) expect(fs.existsSync(path.join(dir, file))).toBe(true);
  });

  test('a version saved meanwhile stops it, and nothing changes', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    const { data } = await gh.repos.createForAuthenticatedUser({ name: 'made-up', private: true });
    git(dir, 'remote', 'add', 'origin', data.clone_url);
    git(dir, 'config', 'censai.githubRepo', data.full_name);
    git(dir, 'push', '-q', 'origin', 'main');
    write(dir, '.env');
    saveWithPlainGit(dir, 'Made-up version with a .env');
    const get = gh.repos.get;
    gh.repos.get = async (args) => {
      // A terminal saves another version just then.
      write(dir, 'index.html', 'Made-up page, saved by a terminal');
      saveWithPlainGit(dir, 'Made-up version from a terminal');
      return get(args);
    };
    await expect(makeVersionsAgain(dir, { token: 'tok', octokit: gh })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/saved meanwhile/) });
    expect(versions(dir)[0]).toMatch(/^Made-up version from a terminal\|/);
    expect(filesAt(dir, 'HEAD')).toEqual(['.env', 'index.html']);
    expect(git(dir, 'show-ref')).not.toContain('made-again');
  });

  test('a merge left half done stops it before anything changes', async () => {
    const dir = tmp();
    write(dir, 'index.html', 'Made-up page\n');
    write(dir, '.env');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    git(dir, 'checkout', '-q', '-b', 'side');
    write(dir, 'index.html', 'Made-up page, side\n');
    saveWithPlainGit(dir, 'Made-up side version');
    git(dir, 'checkout', '-q', 'main');
    write(dir, 'index.html', 'Made-up page, main\n');
    saveWithPlainGit(dir, 'Made-up main version');
    expect(() => git(dir, 'merge', '-q', 'side')).toThrow();
    const head = git(dir, 'rev-parse', 'HEAD');
    await expect(makeVersionsAgain(dir, { token: 'tok', octokit: fakeGithub(tmp()) })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/middle of a merge/) });
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect(filesAt(dir, 'HEAD')).toEqual(['.env', 'index.html']);
  });

  test('a signed version is made again unsigned, since its signature could not match it', async () => {
    const gh = fakeGithub(tmp());
    const dir = tmp();
    write(dir, 'index.html', 'Made-up page\n');
    write(dir, '.env');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up signed version');
    // A made-up signature: git reads only that the version carries one.
    const edge = (word) => `-----${word} SSH SIGNATURE-----`;
    const signed = git(dir, 'cat-file', 'commit', 'HEAD').replace(/^(committer .*)$/m, `$1\ngpgsig ${edge('BEGIN')}\n made-up\n ${edge('END')}`);
    const sha = execFileSync('git', ['-C', dir, 'hash-object', '-t', 'commit', '-w', '--stdin'], { input: `${signed}\n`, encoding: 'utf8' }).trim();
    git(dir, 'update-ref', 'refs/heads/main', sha);
    expect(git(dir, 'cat-file', 'commit', 'HEAD')).toContain('gpgsig');
    expect(await makeVersionsAgain(dir, { token: 'tok', octokit: gh })).toMatchObject({ made: 1, files: ['.env'] });
    expect(git(dir, 'cat-file', 'commit', 'HEAD')).not.toContain('gpgsig');
    expect(versions(dir)[0]).toMatch(/^Made-up signed version\|/);
    expect(filesAt(dir, 'HEAD')).toEqual(['index.html']);
  });

  test('with no such file in the versions GitHub does not have yet there is nothing to make again', async () => {
    const dir = tmp();
    write(dir, 'index.html');
    git(dir, 'init', '-q', '-b', 'main');
    saveWithPlainGit(dir, 'Made-up first version');
    const head = git(dir, 'rev-parse', 'HEAD');
    await expect(makeVersionsAgain(dir, { token: 'tok', octokit: fakeGithub(tmp()) })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/^Nothing to make again/) });
    expect(git(dir, 'rev-parse', 'HEAD')).toBe(head);
    expect((await projectStatus(dir)).changes).toEqual([]);
  });
});

describe('the stream of versions', () => {
  test('a path in quotes comes back as its bytes', () => {
    expect(unquotedPath(Buffer.from('"made up\\"q\\\\b\\303\\251\\t.key"', 'latin1'))).toEqual(Buffer.from('made up"q\\bé\t.key'));
    expect(unquotedPath(Buffer.from('made-up.key'))).toEqual(Buffer.from('made-up.key'));
  });

  test('a line that puts a key file in a version is left out, and a message passes as it is', async () => {
    const SHA = '0123456789abcdef0123456789abcdef01234567';
    const before = [
      'feature done', 'reset refs/made-up', 'commit refs/made-up', 'mark :1', 'author Made Up <made-up@example.com> 1 +0000',
      'committer Made Up <made-up@example.com> 1 +0000', 'data 23', 'M 100644 abc .env\nfixed', `from ${SHA}`, `merge ${SHA}`, 'deleteall',
    ];
    const after = [`M 100644 ${SHA} index.html`, `M 160000 ${SHA} made-up-module`, 'D old.html', '', 'done', ''];
    const stream = [...before, `M 100644 ${SHA} .env`, `M 100644 ${SHA} "made up/a\\"b.pem"`, `M 100755 ${SHA} "cl\\303\\251.key"`, ...after].join('\n');
    const chunks = [];
    // One byte at a time, as a pipe may hand it on.
    for await (const chunk of Readable.from([...Buffer.from(stream)].map((byte) => Buffer.from([byte]))).pipe(withoutKeptOut())) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe([...before, ...after].join('\n'));
  });
});
