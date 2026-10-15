import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parsePorcelain, projectStatus, redactRemote, repoFromRemote, saveVersion, startVersions } from './git.js';
import { authArgs, sendToGithub, slugify } from './publish.js';
import { createNewProject, shownProjectPath } from './newProject.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'projgit-'));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const author = { name: 'Alex', email: 'alex@example.com' };

// A GitHub that only knows the calls "Send to GitHub" makes; repositories
// are bare repos on disk so pushes are real.
function fakeGithub(root) {
  const calls = [];
  const repoDir = (name) => path.join(root, `${name}.git`);
  const repo = (name) => ({ full_name: `alex/${name}`, name, owner: { login: 'alex' }, default_branch: 'main', html_url: `https://github.com/alex/${name}`, clone_url: `file://${repoDir(name)}` });
  return {
    calls,
    repos: {
      createForAuthenticatedUser: async ({ name, private: isPrivate }) => {
        calls.push(['create', name, isPrivate]);
        execFileSync('git', ['init', '-q', '--bare', '-b', 'main', repoDir(name)]);
        return { data: repo(name) };
      },
      get: async ({ repo: name }) => ({ data: repo(name) }),
    },
    git: {
      getRef: async ({ repo: name, ref }) => {
        try {
          const sha = git(repoDir(name), 'rev-parse', '--verify', '-q', `refs/${ref}`);
          return { data: { object: { sha } } };
        } catch {
          throw Object.assign(new Error('Not Found'), { status: 404 });
        }
      },
    },
    pulls: {
      create: async (pr) => { calls.push(['pr', pr.head, pr.base, pr.title]); return { data: { number: 7, html_url: 'https://github.com/alex/x/pull/7' } }; },
    },
  };
}

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
    expect(git(dir, 'log', '-1', '--format=%an <%ae>')).toBe('Alex <alex@example.com>');
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
    expect(parsePorcelain(' M a.js\n?? b.js\nR  old.js -> new.js\n D c.js\n')).toEqual([
      { file: 'a.js', status: 'changed' }, { file: 'b.js', status: 'new' },
      { file: 'new.js', status: 'renamed' }, { file: 'c.js', status: 'deleted' },
    ]);
    expect(repoFromRemote('https://github.com/alex/shop.git')).toBe('alex/shop');
    expect(repoFromRemote('git@github.com:alex/shop.git')).toBe('alex/shop');
    expect(repoFromRemote('https://gitlab.com/alex/shop.git')).toBeNull();
    expect(redactRemote('https://x-access-token:secret@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(slugify('Add a Phone field!')).toBe('add-a-phone-field');
  });

  test('the token only ever goes to GitHub', () => {
    expect(authArgs('https://github.com/alex/shop.git', 'tok')[1]).toMatch(/^http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic /);
    expect(authArgs('https://evil.example/alex/shop.git', 'tok')).toEqual([]);
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
    expect(first).toMatchObject({ kind: 'created', repo: 'alex/lead-form', branch: 'main' });
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
    git(dir, 'remote', 'add', 'origin', 'https://gitlab.com/alex/shop.git');
    await expect(sendToGithub(dir, { token: 'tok', octokit: fakeGithub(tmp()) })).rejects.toThrow(/other than GitHub/);
  });
});
