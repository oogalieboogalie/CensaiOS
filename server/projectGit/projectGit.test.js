import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parsePorcelain, projectStatus, redactRemote, repoFromRemote, runGit, saveVersion, startVersions } from './git.js';
import { authArgs, sendToGithub, slugify } from './publish.js';
import { createNewProject, shownProjectPath } from './newProject.js';
import { keptOutCollector, keptOutOfVersions, listKeptOut } from './keptOut.js';
import { keptOutLine, sendRefusal, someNames } from '../../shared/files/versionWords.js';
import { fakeGithubRepos as fakeGithub } from '../../tests/fixtures/fakeGithubRepos.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-'));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const author = { name: 'Alma', email: 'alma@example.com' };

describe('project versions', () => {
  test('a new project is its own repository with a first version', async () => {
    const home = tmp();
    const made = await createNewProject({ name: 'Lead Form!', author, env: { CENSAI_PROJECTS_FOLDER: home } });
    expect(made).toEqual({ name: 'Lead Form!', path: path.join(home, 'lead-form') });
    const status = await projectStatus(made.path);
    expect(status).toMatchObject({ tracked: true, partOfBigger: false, branch: 'main', changes: [] });
    expect(status.versions[0].message).toBe('First version');
    expect(fs.readFileSync(path.join(made.path, '.gitignore'), 'utf8')).toMatch(/\.team\//);
    await expect(createNewProject({ name: 'lead form', author, env: { CENSAI_PROJECTS_FOLDER: home } })).rejects.toThrow(/already exists/);
    await expect(createNewProject({ name: '  ', env: { CENSAI_PROJECTS_FOLDER: home } })).rejects.toThrow(/name/);
  });

  test('Docker shows the projects folder in the PC\'s own words', () => {
    expect(shownProjectPath('shop', { CENSAI_PROJECTS_FOLDER: '/workspace/projects', CENSAI_PROJECTS_FOLDER_ON_PC: 'D:\\Projects\\' })).toBe('D:\\Projects\\shop');
    expect(shownProjectPath('shop', { CENSAI_PROJECTS_FOLDER: '/workspace/projects' })).toBe(path.join('/workspace/projects', 'shop'));
  });

  test('changes are listed and saved as one version with the person as author', async () => {
    const dir = tmp();
    await startVersions(dir, { author });
    fs.writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
    expect((await projectStatus(dir)).changes).toEqual([{ file: 'index.html', status: 'new' }]);
    const after = await saveVersion(dir, { message: 'Add the page', author });
    expect(after.changes).toEqual([]);
    expect(after.versions[0].message).toBe('Add the page');
    expect(git(dir, 'log', '-1', '--format=%an <%ae>')).toBe('Alma <alma@example.com>');
    await expect(saveVersion(dir, { message: 'again', author })).rejects.toThrow(/Nothing changed/);
  });

  test('a folder that is not a repository says so; one inside a bigger project says so', async () => {
    const dir = tmp();
    expect(await projectStatus(dir)).toEqual({ tracked: false, changes: [], versions: [] });
    await startVersions(dir, { author });
    fs.mkdirSync(path.join(dir, 'src'));
    expect((await projectStatus(path.join(dir, 'src'))).partOfBigger).toBe(true);
  });

  test('porcelain lines become plain words', () => {
    // git status -z: a rename names its new path, then the old one; no name is quoted.
    expect(parsePorcelain(' M a.js\0?? b.js\0R  new.js\0old.js\0 D c.js\0?? made up -> name.js\0?? "q".js\0')).toEqual([
      { file: 'a.js', status: 'changed' }, { file: 'b.js', status: 'new' },
      { file: 'new.js', status: 'renamed' }, { file: 'c.js', status: 'deleted' },
      { file: 'made up -> name.js', status: 'new' }, { file: '"q".js', status: 'new' },
    ]);
    expect(repoFromRemote('https://github.com/alma/shop.git')).toBe('alma/shop');
    expect(repoFromRemote('git@github.com:alma/shop.git')).toBe('alma/shop');
    expect(repoFromRemote('https://gitlab.com/alma/shop.git')).toBeNull();
    expect(redactRemote('https://x-access-token:secret@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(slugify('Add a Phone field!')).toBe('add-a-phone-field');
  });

  test('the token only ever goes to GitHub', () => {
    expect(authArgs('https://github.com/alma/shop.git', 'tok')[1]).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic /);
    expect(authArgs('https://evil.example/alma/shop.git', 'tok')).toEqual([]);
    expect(authArgs('file:///tmp/x.git', 'tok')).toEqual([]);
    expect(authArgs('https://github.com/a/b.git', '')).toEqual([]);
  });

  test('send to GitHub: first a private repository, then a pull request', async () => {
    const dir = tmp();
    const gh = fakeGithub(tmp());
    await startVersions(dir, { author });
    fs.writeFileSync(path.join(dir, 'index.html'), 'v1');
    await expect(sendToGithub(dir, { token: '', octokit: gh })).rejects.toThrow(/Connect GitHub/);

    const first = await sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'Lead form', octokit: gh });
    expect(first).toMatchObject({ kind: 'created', repo: 'alma/lead-form', branch: 'main' });
    expect(gh.calls[0]).toEqual(['create', 'lead-form', true]);
    expect(first.status.changes).toEqual([]); // unsaved work was saved first

    await expect(sendToGithub(dir, { token: 'tok', octokit: gh })).rejects.toThrow(/Nothing new/);

    fs.writeFileSync(path.join(dir, 'index.html'), 'v2');
    const second = await sendToGithub(dir, { token: 'tok', title: 'Add a phone field', author, octokit: gh });
    expect(second).toMatchObject({ kind: 'pull-request', number: 7 });
    expect(second.branch).toMatch(/^censai\/add-a-phone-field-[0-9a-f]{7}$/);
    expect(gh.calls.at(-1)).toEqual(['pr', second.branch, 'main', 'Add a phone field']);
    const remote = fs.readdirSync(path.dirname(new URL(git(dir, 'remote', 'get-url', 'origin')).pathname))[0];
    expect(remote).toBe('lead-form.git');
  });

  test('a folder sending somewhere other than GitHub is left alone', async () => {
    const dir = tmp();
    await startVersions(dir, { author });
    git(dir, 'remote', 'add', 'origin', 'https://gitlab.com/alma/shop.git');
    await expect(sendToGithub(dir, { token: 'tok', octokit: fakeGithub(tmp()) })).rejects.toThrow(/other than GitHub/);
  });
});

// A file that holds keys or passwords (a .env, a key file, copies of them) is
// never saved in a version and never sent to GitHub: it stays on this
// computer. All names, keys and repositories are made up.
describe('files that hold keys stay out of versions and off GitHub', () => {
  const KEY = 'not-a-real-made-up-key';
  const SECRETS = [
    '.env', '.env.local', 'certs/server.key', 'deploy/id_rsa.bak', 'credentials (1).json', 'made-up [1].env', '.homebase-state/made-up.txt',
    'config/secrets.yml', 'serviceAccountKey.json', 'infra/terraform.tfvars', 'infra/made-up.auto.tfvars', 'made-up-app-firebase-adminsdk-ab1cd.json',
  ];
  const ORDINARY = ['.env.example', 'index.html', 'notes/made-up-plan.md', 'config/secrets.example.json', 'firebase.json', 'infra/variables.tf'];
  const sorted = (list) => [...list].sort();
  const write = (dir, rel, words = `${rel} ${KEY}\n`) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), words);
  };
  const filesIn = (dir, rev = 'HEAD') => git(dir, 'ls-tree', '-r', '--name-only', '-z', rev).split('\0').filter(Boolean);
  /** Every path any commit of the folder's repository ever held. */
  const everHeld = (dir) => [...new Set(git(dir, 'rev-list', '--all').split('\n').flatMap((sha) => filesIn(dir, sha)))];
  /** A folder whose versions someone saved with plain git, files that hold keys and all, as before this change. */
  const savedWithPlainGit = (files) => {
    const dir = tmp();
    for (const file of files) write(dir, file);
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up first version');
    return dir;
  };

  test('the rule: files that hold keys by their names, anywhere, and censaiOS\'s own state folder', () => {
    for (const file of [...SECRETS, 'a/b/prod.env', '.HOMEBASE-STATE/x.json', 'keys\\server.pem']) expect(keptOutOfVersions(file)).toBe(true);
    for (const file of [...ORDINARY, 'id_rsa.pub', '.envx', 'src/process.env.js', '.github/workflows/ci.yml', '']) expect(keptOutOfVersions(file)).toBe(false);
  });

  test('the plain words name a few files and count the rest', () => {
    expect(someNames(['.env'])).toBe('.env');
    expect(someNames(['.env', 'a.key'])).toBe('.env and a.key');
    expect(someNames(['.env', 'a.key', 'b.pem'])).toBe('.env, a.key and b.pem');
    expect(someNames(['.env', 'a.key', 'b.pem', 'c.p12', 'd.pfx'])).toBe('.env, a.key, b.pem and 2 more');
    expect(keptOutLine(['.env'])).toBe('Left out of saved versions: .env. Files like these can hold keys or passwords, so what they hold now stays on this computer and is never sent to GitHub.');
    expect(sendRefusal(['.env'])).toMatch(/^Nothing was sent to GitHub: earlier saved versions of this project hold \.env, a file that can hold keys/);
    expect(sendRefusal(['.env', 'a.key'])).toMatch(/hold \.env and a\.key, files that can hold keys/);
  });

  test('saving versions leaves them out, says so, and keeps them on this computer', async () => {
    const dir = tmp();
    for (const file of [...SECRETS, ...ORDINARY]) write(dir, file);
    const started = await startVersions(dir, { author });
    expect(sorted(filesIn(dir))).toEqual(sorted(ORDINARY));
    expect(sorted(started.keptOut)).toEqual(sorted(SECRETS));
    expect(started.changes).toEqual([]);

    write(dir, '.env', `changed ${KEY}\n`);
    write(dir, 'certs/new.pem');
    write(dir, 'index.html', 'Made-up page, second version');
    expect((await projectStatus(dir)).changes).toEqual([{ file: 'index.html', status: 'changed' }]);
    const saved = await saveVersion(dir, { message: 'Second page', author });
    expect(saved.changes).toEqual([]);
    expect(sorted(saved.keptOut)).toEqual(sorted([...SECRETS, 'certs/new.pem']));
    expect(everHeld(dir).filter(keptOutOfVersions)).toEqual([]);
    for (const file of SECRETS) expect(fs.readFileSync(path.join(dir, file), 'utf8')).toContain(KEY);

    // A change only to such a file is nothing to save.
    write(dir, 'certs/server.key', `changed ${KEY}\n`);
    expect((await projectStatus(dir)).changes).toEqual([]);
    await expect(saveVersion(dir, { message: 'Only the key', author })).rejects.toThrow(/Nothing changed/);
  });

  test('a change to one an earlier version holds is left out, and that version keeps what it held', async () => {
    const dir = savedWithPlainGit(['index.html', '.env', 'certs/server.key', 'old.pem']);
    const held = git(dir, 'rev-parse', 'HEAD:.env');
    write(dir, '.env', `changed ${KEY}\n`);
    write(dir, 'index.html', 'Made-up page, second version');
    // Deleting one is a change: a version that drops it is welcome.
    fs.rmSync(path.join(dir, 'old.pem'));
    const before = await projectStatus(dir);
    expect(before.changes).toEqual([{ file: 'index.html', status: 'changed' }, { file: 'old.pem', status: 'deleted' }]);
    expect(before.keptOut).toEqual(['.env']);
    const saved = await saveVersion(dir, { message: 'Second page', author });
    expect(filesIn(dir)).toEqual(['.env', 'certs/server.key', 'index.html']);
    expect(git(dir, 'rev-parse', 'HEAD:.env')).toBe(held);
    expect(git(dir, 'show', 'HEAD:index.html')).toBe('Made-up page, second version');
    expect(git(dir, 'log', '--all', '-p')).not.toContain(`changed ${KEY}`);
    expect(saved.changes).toEqual([]);
    expect(saved.keptOut).toEqual(['.env']);
    expect(fs.readFileSync(path.join(dir, '.env'), 'utf8')).toBe(`changed ${KEY}\n`);
  });

  test('a folder inside a bigger project leaves them out anywhere in the project', async () => {
    const dir = tmp();
    await startVersions(dir, { author });
    write(dir, 'site/index.html');
    write(dir, 'other/.env');
    const site = path.join(dir, 'site');
    const status = await projectStatus(site);
    expect(status.changes).toEqual([{ file: 'site/index.html', status: 'new' }]);
    expect(status.keptOut).toEqual(['other/.env']);
    await saveVersion(site, { message: 'Add the page', author });
    expect(filesIn(dir)).toEqual(['site/index.html']);
  });

  test('names that come in pieces, or in bytes that are not UTF-8, are each told apart as git wrote them', () => {
    const found = keptOutCollector();
    for (const piece of ['.e', 'nv\0index.html\0cer', 'ts/server.k', 'ey\0.env\0']) found.add(Buffer.from(piece));
    // Two names that read the same once taken as UTF-8.
    const odd = (byte) => Buffer.from([...Buffer.from('made-up-'), byte, ...Buffer.from('.pem')]);
    found.add(Buffer.concat([odd(0xe9), Buffer.from([0]), odd(0xe8), Buffer.from([0])]));
    expect(found.names()).toEqual([Buffer.from('.env'), Buffer.from('certs/server.key'), odd(0xe9), odd(0xe8)]);
  });

  test('a long name in letters that are not ASCII is judged by its letters, not its bytes', () => {
    const found = keptOutCollector();
    // 144 letters, 284 bytes: longer than any name, counted in bytes.
    const long = Buffer.from(`keys/${'я'.repeat(140)}.env`);
    found.add(Buffer.concat([long, Buffer.from([0])]));
    expect(found.names()).toEqual([long]);
  });

  test('a git command that fails is an error, never "nothing held"', async () => {
    await expect(listKeptOut(tmp(), ['ls-files', '-z'])).rejects.toMatchObject({ git: true });
  });

  test('a git that stops before reading what it is given answers through its exit code, and the server goes on', async () => {
    await expect(runGit(tmp(), ['--version'], { input: Buffer.alloc(8 * 1024 * 1024, 46) })).resolves.toMatch(/^git version/);
  });

  test('another repository inside the project, in a folder named like a key file, is left out too', async () => {
    const dir = tmp();
    write(dir, 'index.html');
    await startVersions(dir, { author });
    const inner = path.join(dir, 'vendor', 'creds.pem');
    write(inner, 'made-up.txt');
    git(inner, 'init', '-q', '-b', 'main');
    git(inner, 'add', '-A');
    git(inner, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up inner version');
    write(dir, 'index.html', 'Made-up page, second version');
    const before = await projectStatus(dir);
    expect(before.changes).toEqual([{ file: 'index.html', status: 'changed' }]);
    expect(before.keptOut).toEqual(['vendor/creds.pem/']);
    await saveVersion(dir, { message: 'Second page', author });
    expect(filesIn(dir)).toEqual(['index.html']);
  });

  // Windows allows neither "?", ":" nor bytes that are not UTF-8 in a name.
  const linuxOnly = process.platform === 'linux' ? test : test.skip;
  linuxOnly('a name is left out as it is spelled: glob and pathspec letters, and bytes that are not UTF-8', async () => {
    const dir = tmp();
    // As a pattern, ".env?" would match ".envx", and ":!made-up.env" everything
    // but "made-up.env": ordinary files that must stay in the version.
    for (const file of ['.env?', ':!made-up.env', '.envx', 'index.html']) write(dir, file);
    for (const byte of [0xe9, 0xe8]) fs.writeFileSync(Buffer.concat([Buffer.from(path.join(dir, 'made-up-')), Buffer.from([byte]), Buffer.from('.pem')]), KEY);
    await startVersions(dir, { author });
    expect(filesIn(dir)).toEqual(['.envx', 'index.html']);
  });

  test('Send to GitHub sends a project without them', async () => {
    const dir = tmp();
    const gh = fakeGithub(tmp());
    for (const file of [...SECRETS, ...ORDINARY]) write(dir, file);
    await startVersions(dir, { author });
    write(dir, 'index.html', 'Made-up page, second version');
    const first = await sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'Made up', octokit: gh });
    expect(first).toMatchObject({ kind: 'created', repo: 'alma/made-up' });
    expect(sorted(gh.pathsIn('made-up'))).toEqual(sorted(ORDINARY));

    write(dir, 'index.html', 'Made-up page, third version');
    write(dir, 'certs/another.key');
    const second = await sendToGithub(dir, { token: 'tok', title: 'Third page', author, octokit: gh });
    expect(second.kind).toBe('pull-request');
    expect(sorted(gh.pathsIn('made-up'))).toEqual(sorted(ORDINARY));
  });

  test('Send to GitHub sends nothing while an earlier version holds one, and makes no repository', async () => {
    const dir = savedWithPlainGit(['index.html', '.env', 'certs/server.key']);
    const gh = fakeGithub(tmp());
    write(dir, 'index.html', 'Made-up page, second version');
    write(dir, '.env', `changed ${KEY}\n`);
    await expect(sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'made-up', octokit: gh }))
      .rejects.toMatchObject({ status: 409, message: sendRefusal(['.env', 'certs/server.key']) });
    expect(gh.calls).toEqual([]);
    expect(fs.existsSync(gh.repoDir('made-up'))).toBe(false);
    // The send saved the page first; the change to the .env is in no version.
    expect(git(dir, 'show', 'HEAD:index.html')).toBe('Made-up page, second version');
    expect(git(dir, 'log', '--all', '-p')).not.toContain(`changed ${KEY}`);
  });

  test('a secrets file an earlier version holds stops the send the same way', async () => {
    const dir = savedWithPlainGit(['index.html', 'config/secrets.yml']);
    const gh = fakeGithub(tmp());
    write(dir, 'index.html', 'Made-up page, second version');
    await expect(sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'made-up', octokit: gh }))
      .rejects.toMatchObject({ status: 409, message: sendRefusal(['config/secrets.yml']) });
    expect(gh.calls).toEqual([]);
  });

  test('a later send sends nothing while a version not yet on GitHub holds one', async () => {
    const dir = tmp();
    const gh = fakeGithub(tmp());
    write(dir, 'index.html');
    await startVersions(dir, { author });
    await sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'made-up', octokit: gh });
    // A terminal or an agent saves a version with plain git, key file and all.
    write(dir, 'certs/server.key');
    write(dir, 'index.html', 'Made-up page, second version');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up second version');
    await expect(sendToGithub(dir, { token: 'tok', title: 'Second page', author, octokit: gh }))
      .rejects.toMatchObject({ status: 409, message: sendRefusal(['certs/server.key']) });
    expect(gh.calls.filter(([kind]) => kind === 'pr')).toEqual([]);
    expect(gh.pathsIn('made-up')).toEqual(['index.html']);
  });

  /** A folder whose plain-git versions, .env and all, GitHub got before this change; its main branch is `main` there. */
  async function sentBefore(gh) {
    const dir = savedWithPlainGit(['index.html', '.env']);
    const { data } = await gh.repos.createForAuthenticatedUser({ name: 'made-up', private: true });
    git(dir, 'remote', 'add', 'origin', data.clone_url);
    git(dir, 'config', 'censai.githubRepo', data.full_name);
    return { dir, url: data.clone_url };
  }

  test('one GitHub already has does not stop a send, and a change to it stays on this computer', async () => {
    const gh = fakeGithub(tmp());
    const { dir, url } = await sentBefore(gh);
    // Sent by its address, so only GitHub's own main branch says what it has.
    git(dir, 'push', '-q', url, 'main');
    write(dir, 'index.html', 'Made-up page, second version');
    write(dir, '.env', `changed ${KEY}\n`);
    const sent = await sendToGithub(dir, { token: 'tok', title: 'Second page', author, octokit: gh });
    expect(sent.kind).toBe('pull-request');
    expect(sent.status.keptOut).toEqual(['.env']);
    expect(git(gh.repoDir('made-up'), 'show', `${sent.branch}:index.html`)).toBe('Made-up page, second version');
    expect(git(gh.repoDir('made-up'), 'log', '--all', '-p')).not.toContain(`changed ${KEY}`);
  });

  test('a version that deletes one from a project GitHub already has is sent: it holds no key', async () => {
    const gh = fakeGithub(tmp());
    const { dir } = await sentBefore(gh);
    git(dir, 'push', '-q', 'origin', 'main');
    fs.rmSync(path.join(dir, '.env'));
    expect((await projectStatus(dir)).changes).toEqual([{ file: '.env', status: 'deleted' }]);
    const sent = await sendToGithub(dir, { token: 'tok', title: 'Take the env out', author, octokit: gh });
    expect(sent.kind).toBe('pull-request');
    expect(filesIn(gh.repoDir('made-up'), sent.branch)).toEqual(['index.html']);
  });

  test('what this folder last fetched from GitHub counts as sent, even after GitHub moved on', async () => {
    const gh = fakeGithub(tmp());
    const { dir } = await sentBefore(gh);
    git(dir, 'push', '-q', 'origin', 'main');
    // Someone else adds a version on GitHub, which this folder has not fetched.
    const other = tmp();
    execFileSync('git', ['clone', '-q', gh.repoDir('made-up'), other]);
    write(other, 'README.md');
    git(other, 'add', '-A');
    git(other, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up version from someone else');
    git(other, 'push', '-q', 'origin', 'main');
    write(dir, 'index.html', 'Made-up page, second version');
    const sent = await sendToGithub(dir, { token: 'tok', title: 'Second page', author, octokit: gh });
    expect(sent.kind).toBe('pull-request');
  });

  test('a key file a merge itself brings in stops a send', async () => {
    const dir = tmp();
    const gh = fakeGithub(tmp());
    write(dir, 'index.html');
    await startVersions(dir, { author });
    git(dir, 'checkout', '-q', '-b', 'side');
    write(dir, 'side.html');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up side version');
    git(dir, 'checkout', '-q', 'main');
    git(dir, 'merge', '-q', '--no-ff', '--no-commit', 'side');
    write(dir, 'merge.key');
    git(dir, 'add', 'merge.key');
    git(dir, '-c', 'user.name=Made Up', '-c', 'user.email=made-up@example.com', 'commit', '-qm', 'Made-up merge');
    await expect(sendToGithub(dir, { token: 'tok', title: 'First page', author, repoName: 'made-up', octokit: gh }))
      .rejects.toMatchObject({ status: 409, message: sendRefusal(['merge.key']) });
    expect(gh.calls).toEqual([]);
  });
});
