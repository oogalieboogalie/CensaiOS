import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A project's files that hold keys and passwords open only for this
// computer's owner: Pat Example owns it, Sam Example is a teammate on the
// board. Sam gets plain words, never the file's words, and the same answer
// whether or not the file is there. All files and words are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-secret-files-')));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-project');
const elsewhere = path.join(tempRoot, 'made-up-elsewhere');
const KEY_WORDS = 'not-a-real-made-up-key';
const TOKEN = 'made-up-token';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const inProject = (...parts) => path.join(project, ...parts);

function write(file, words) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, words);
}
write(inProject('notes.md'), 'Made-up note');
write(inProject('.env'), `MADE_UP_KEY=${KEY_WORDS}\n`);
write(inProject('.env.example'), 'MADE_UP_KEY=\n');
write(inProject('made-up-server.key'), `MADE-UP PRIVATE KEY ${KEY_WORDS}`);
write(inProject('.git', 'config'), `[remote "origin"]\n  url = https://${TOKEN}@example.invalid/made-up.git\n`);
write(path.join(elsewhere, 'outside-note.md'), 'Made-up words outside the project');
write(path.join(elsewhere, 'picture.png'), PNG);
fs.symlinkSync(inProject('.env'), inProject('made-up-link.md'));
fs.symlinkSync(inProject('.git'), inProject('made-up-git'));
fs.symlinkSync(elsewhere, inProject('made-up-elsewhere'));
fs.symlinkSync(path.join(elsewhere, 'outside-note.md'), inProject('made-up-outside-link.md'));
write(path.join(stateDir, 'open-projects.json'), JSON.stringify([project]));
process.env.CENSAI_STATE_DIR = stateDir;

const { browserRouter } = await import('../server/routes/files/browser.js');
const { projectGitRouter } = await import('../server/routes/projectGit.js');
const { OWN_STATE_WORDS } = await import('../server/routes/files/ownState.js');
const { inHiddenFolder, isSecretFileName, linkedSecret, secretRepoPath } = await import('../server/security/secretFiles.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');
const { rootOf } = await import('../server/cli-agents/folders.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter);
  a.use('/api/project-git', projectGitRouter);
  return a;
}
const read = (who, p) => request(app(who)).get('/api/files/content').query({ path: p });
const browse = (who, p) => request(app(who)).get('/api/files/browse').query({ path: p });
const OWNER_ONLY = { error: FILE_PROBLEMS.ownerOnly, reason: 'ownerOnly' };
const OUTSIDE = { error: FILE_PROBLEMS.outside, reason: 'outside' };

afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("a project's files that hold keys", () => {
  const secrets = ['.env', 'made-up-server.key', path.join('.git', 'config'), 'made-up-link.md', path.join('made-up-git', 'config')];

  test('open for Sam in plain words only, never their words', async () => {
    for (const name of secrets) {
      const res = await read(SAM, inProject(name)).expect(403);
      expect(res.body).toEqual(OWNER_ONLY);
      expect(res.text).not.toContain(KEY_WORDS);
      expect(res.text).not.toContain(TOKEN);
    }
  });

  test('give Sam the same answer whether or not the file is there', async () => {
    const there = await read(SAM, inProject('.env')).expect(403);
    for (const name of ['.env.local', 'made-up-not-there.pem', path.join('.git', 'made-up-not-there')]) {
      expect((await read(SAM, inProject(name)).expect(403)).text).toBe(there.text);
    }
  });

  test("open for Pat, the owner, marked as Pat's alone so the window keeps them off the shared board", async () => {
    for (const [name, words] of [['.env', KEY_WORDS], ['made-up-link.md', KEY_WORDS], ['made-up-server.key', KEY_WORDS], [path.join('.git', 'config'), TOKEN], [path.join('made-up-git', 'config'), TOKEN]]) {
      const { body } = await read(PAT, inProject(name)).expect(200);
      expect(body.content).toContain(words);
      expect(body.ownerOnly).toBe(true);
    }
  });

  test('an example file and an ordinary file open for Sam, and for Pat with no such mark', async () => {
    expect((await read(SAM, inProject('.env.example')).expect(200)).body.content).toBe('MADE_UP_KEY=\n');
    expect((await read(SAM, inProject('notes.md')).expect(200)).body.content).toBe('Made-up note');
    for (const name of ['.env.example', 'notes.md']) expect((await read(PAT, inProject(name)).expect(200)).body.ownerOnly).toBeUndefined();
  });
});

describe('a link that leads out of the project', () => {
  test('is outside it for Sam, there or not, and Pat still opens it', async () => {
    const asked = [inProject('made-up-outside-link.md'), inProject('made-up-elsewhere', 'outside-note.md')];
    for (const p of asked) expect((await read(SAM, p).expect(403)).body).toEqual(OUTSIDE);
    const notThere = await read(SAM, inProject('made-up-elsewhere', 'made-up-not-there.md')).expect(403);
    expect(notThere.body).toEqual(OUTSIDE);
    for (const p of asked) expect((await read(PAT, p).expect(200)).body).toMatchObject({ content: 'Made-up words outside the project', ownerOnly: true });
  });

  test('shows Sam no picture through it, and Pat sees it', async () => {
    const picture = inProject('made-up-elsewhere', 'picture.png');
    await request(app(SAM)).get('/api/files/image').query({ path: picture }).expect(403);
    const res = await request(app(PAT)).get('/api/files/image').query({ path: picture }).expect(200);
    expect(res.headers['content-type']).toBe('image/png');
  });
});

describe('Files and search', () => {
  test("do not list a hidden folder or a folder outside the project for Sam, and do for Pat", async () => {
    const hidden = await browse(SAM, inProject('.git')).expect(403);
    expect(hidden.body.error).toBe("Only this computer's owner can open this folder.");
    expect(hidden.text).not.toContain('config');
    expect((await browse(SAM, inProject('made-up-elsewhere')).expect(403)).text).not.toContain('outside-note');
    const search = await request(app(SAM)).get('/api/files/search').query({ q: 'outside', path: inProject('made-up-elsewhere') }).expect(403);
    expect(search.text).not.toContain('outside-note');
    expect((await browse(PAT, inProject('made-up-elsewhere')).expect(200)).body.children.map((c) => c.name)).toContain('outside-note.md');
    expect((await browse(SAM, project).expect(200)).body.children.map((c) => c.name)).toContain('notes.md');
  });

  test('asked again to catch changes (relist), a folder answers each person exactly as opening it does', async () => {
    const relist = (who, p) => request(app(who)).get('/api/files/relist').query({ path: p });
    const folders = [project, inProject('.git'), inProject('made-up-git'), inProject('made-up-elsewhere'), inProject('made-up-not-there'), elsewhere];
    const statuses = new Set();
    for (const who of [PAT, SAM]) {
      for (const p of folders) {
        const opened = await browse(who, p);
        const again = await relist(who, p);
        expect({ status: again.status, body: again.body }).toEqual({ status: opened.status, body: opened.body });
        statuses.add(opened.status);
      }
    }
    // Lists, refusals and a missing folder were all compared.
    expect([...statuses].sort()).toEqual([200, 403, 404]);
  });
});

describe("censaiOS's own folders", () => {
  test('a folder its settings keep coding-agent work or logs in never opens, for anyone', async () => {
    for (const name of ['CENSAI_CLI_AGENT_DATA', 'CENSAI_WORKTREE_DIR', 'CENSAI_LEGION_DIR', 'LOG_DIR']) {
      const folder = inProject(`made-up-${name.toLowerCase()}`);
      write(path.join(folder, 'made-up.json'), '{"madeUp":true}');
      process.env[name] = folder;
      try {
        const res = await read(PAT, path.join(folder, 'made-up.json')).expect(403);
        expect(res.body.reason).toBe('secret');
      } finally {
        delete process.env[name];
      }
      expect((await read(PAT, path.join(folder, 'made-up.json')).expect(200)).body.content).toBe('{"madeUp":true}');
    }
  });

  (process.platform === 'linux' ? test : test.skip)("a link to the running app's own settings (/proc/self/environ) never opens, for anyone", async () => {
    fs.symlinkSync('/proc/self/environ', inProject('made-up-settings.md'));
    fs.symlinkSync('/proc/self', inProject('made-up-running'));
    for (const p of [inProject('made-up-settings.md'), inProject('made-up-running', 'environ')]) {
      const res = await read(PAT, p).expect(403);
      expect(res.body).toEqual({ error: FILE_PROBLEMS.secret, reason: 'secret' });
      expect(res.text).not.toContain('PATH=');
    }
    expect((await browse(PAT, inProject('made-up-running')).expect(403)).text).not.toContain('environ');
  });

  test('version saving says so in plain words', async () => {
    const own = inProject('.homebase-state');
    fs.mkdirSync(own, { recursive: true });
    const res = await request(app(PAT)).get('/api/project-git/status').query({ path: own }).expect(403);
    expect(res.body.error).toBe(OWN_STATE_WORDS);
  });
});

test('a folder picked inside a project, a hidden one included, belongs to that project for the checks Step cards run', async () => {
  expect(await rootOf(inProject('.git'))).toBe(project);
  expect(await rootOf(project)).toBe(project);
  expect(await rootOf(elsewhere)).toBeNull();
});

describe('isSecretFileName', () => {
  test.each([
    '.env', '.env.local', '.ENV', '.env.', '.env::$DATA', 'made-up.env', '.envrc', 'id_rsa', 'id_ed25519',
    'made-up.pem', 'made-up.key', 'made-up.p12', 'made-up.crt', '.npmrc', '.netrc', '.git-credentials', 'credentials',
    '.env-local', '.env_prod', '.env-cmdrc', 'made-up:name.pem', 'credentials.json', '.pgpass', '.pypirc', '.htpasswd',
    '.vault-token', '.s3cfg', '.my.cnf', '.bash_history', 'made-up.p8', 'made-up.jks', 'made-up.ppk',
  ])('%s holds keys', (name) => expect(isSecretFileName(name)).toBe(true));

  test.each([
    // A cloud service's key file, Firebase's and Google's downloaded keys.
    'serviceAccountKey.json', 'made-up-app-firebase-adminsdk-ab1cd-0123456789.json', 'client_secret.json', 'client_secrets.json',
    'client_secret_0123-made-up.apps.googleusercontent.com.json', 'CLIENT_SECRET.JSON',
    // A project's secrets file, and the values Terraform reads by itself.
    'secrets.json', 'secrets.yml', 'secrets.yaml', 'terraform.tfvars', 'made-up.auto.tfvars', 'terraform.tfvars.json', 'made-up.auto.tfvars.json',
    // Copies and backups of them.
    'secrets (1).json', 'secrets.yml.bak', 'serviceAccountKey copy.json', 'terraform.tfvars~', 'made-up.auto.tfvars.orig', 'client_secret (2).json',
  ])('%s, a key file a service, a framework or Terraform names, holds keys', (name) => expect(isSecretFileName(name)).toBe(true));

  test.each([
    '.secrets.yml.swp', '.serviceAccountKey.json.swo', '.terraform.tfvars.swp', '.id_rsa.swp', 'secrets(1).json', 'credentials(1).json', 'terraform(2).tfvars', 'id_rsa(2)',
  ])("%s, Vim's swap file of one or a copy numbered with no space, holds keys too", (name) => expect(isSecretFileName(name)).toBe(true));

  test.each([
    'secrets.example.json', 'secrets.sample.yml', 'secrets.template.yaml', 'secrets.yml.example', 'serviceAccountKey.example.json',
    'client_secret.example.json', 'client_secrets.sample.json', 'made-up-app-firebase-adminsdk-ab1cd.example.json', 'terraform.tfvars.example',
    'made-up.auto.tfvars.sample', 'secrets.md', 'firebase.json', '.firebaserc', 'client_secret.md',
    'variables.tf', 'made-up.tfvars.md', 'made-up-adminsdk.json', 'made-up-firebase.json', 'client_secret_example.json', 'client_secret-sample.json',
    '.made-up-notes.md.swp', 'made-up-notes(1).md',
  ])('%s, a look-alike, does not', (name) => expect(isSecretFileName(name)).toBe(false));

  test.each([
    '.env~', '.env copy', '.env (1)', '.env2', '.env - Copy', '.env.save', 'id_rsa.bak', 'id_rsa copy 2', 'id_rsa - Copy (2)',
    'made-up.key~', 'made-up.key.bak', 'made-up.pem.orig', 'credentials.json.bak', '.made-up.key.swp',
    'credentials (1).json', 'credentials copy.json', 'made-up (2).pem',
  ])('%s, a copy or a backup, holds keys too', (name) => expect(isSecretFileName(name)).toBe(true));

  test.each(['id_rsa_made-up', 'id_ed25519-2', 'id_ecdsa2', 'made-up_deploy_key', 'private-key', 'made-up-api-key'])(
    '%s, an SSH key or a key by another name, holds keys',
    (name) => expect(isSecretFileName(name)).toBe(true),
  );

  test('a name longer than any file can have is not one, and a name with many copy marks is judged in time', () => {
    expect(isSecretFileName(`${'a'.repeat(300)}.env`)).toBe(false);
    const started = Date.now();
    expect(isSecretFileName(`.env${' (1)'.repeat(60)}`)).toBe(true);
    expect(isSecretFileName(`notes${'~'.repeat(250)}`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });

  test('the dots and spaces a name ends with are taken off once, not tried from each of them', () => {
    const name = `${'. '.repeat(129)}x`;
    const started = Date.now();
    let found = 0;
    for (let at = 0; at < 5000; at += 1) found += isSecretFileName(name) ? 1 : 0;
    expect(found).toBe(0);
    expect(Date.now() - started).toBeLessThan(600);
  });

  test.each([
    '.env.example', '.env.sample', '.env.local.template', 'notes.md', 'id_rsa.pub', 'environment.md', 'package.json', '.gitignore', '',
    '.environment', 'made-up-env.md', 'credentials.md', '.env.example.bak', 'notes.bak', 'notes.md~', 'made-up (final).md',
    'id_rsa_made-up.pub', 'monkey', 'made-up_key.txt', 'keyboard.md',
  ])('%s does not', (name) => expect(isSecretFileName(name)).toBe(false));
});

describe('inHiddenFolder', () => {
  test('a hidden folder such as .git or .vscode keeps its files, as asked or as the folder itself', () => {
    expect(inHiddenFolder(path.join('.git', 'config'))).toBe(true);
    expect(inHiddenFolder(path.join('made-up', '.vscode', 'settings.json'))).toBe(true);
    expect(inHiddenFolder('.git', { isFile: false })).toBe(true);
    expect(inHiddenFolder('.gitignore')).toBe(false);
    expect(inHiddenFolder(path.join('.', 'src', 'notes.md'))).toBe(false);
    // A folder above, written "..", is not a hidden one.
    expect(inHiddenFolder(path.join('..', 'package.json'))).toBe(false);
    expect(inHiddenFolder('..', { isFile: false })).toBe(false);
    expect(inHiddenFolder(path.join('..', '..', '.git', 'config'))).toBe(true);
  });

  test("GitHub's settings and censaiOS's notes for the board's agents are shared", () => {
    expect(inHiddenFolder(path.join('.github', 'workflows', 'made-up.yml'))).toBe(false);
    expect(inHiddenFolder(path.join('.team', 'PROJECT.md'))).toBe(false);
    expect(inHiddenFolder('.GitHub', { isFile: false })).toBe(false);
  });
});

describe('secretRepoPath, for a path in a GitHub repo', () => {
  test.each([
    '.env', 'made-up/.env', 'a/../.env', '.env/.', 'made-up\\.env', '.env?x=.md', 'notes.md#.env', 'made-up/id_ed25519',
    'config/secrets.yml', 'infra/made-up.auto.tfvars', 'made-up/serviceAccountKey.json',
  ])('%s holds keys', (rel) => {
    expect(secretRepoPath(rel)).toBe(true);
  });

  test.each(['notes.md', '.env.example', '.github/workflows/made-up.yml', '', 'made-up/notes.md?x=1', 'config/secrets.example.json'])('%s does not', (rel) => {
    expect(secretRepoPath(rel)).toBe(false);
  });

  test('GitHub answering a read with a file that holds keys means a link led there', () => {
    expect(linkedSecret('docs/made-up-link.md', '.env')).toBe(true);
    expect(linkedSecret('docs/made-up-link.md', 'config/made-up.key')).toBe(true);
    expect(linkedSecret('.env', '.env')).toBe(false);
    expect(linkedSecret('notes.md', 'notes.md')).toBe(false);
    expect(linkedSecret('notes.md', undefined)).toBe(false);
  });
});

describe('key files a service, a framework or Terraform names', () => {
  const cloud = (...parts) => inProject('made-up-cloud', ...parts);
  const keys = [
    'serviceAccountKey.json', 'made-up-app-firebase-adminsdk-ab1cd-0123456789.json', 'client_secret_0123-made-up.apps.googleusercontent.com.json',
    path.join('config', 'secrets.yml'), 'secrets.json', 'terraform.tfvars', path.join('infra', 'made-up.auto.tfvars'),
  ];

  test("open only for Pat, the owner, while their examples open for Sam", async () => {
    for (const name of keys) write(cloud(name), `made_up_key: ${KEY_WORDS}\n`);
    write(cloud('secrets.example.json'), '{ "made_up_key": "" }\n');
    for (const name of keys) {
      const res = await read(SAM, cloud(name)).expect(403);
      expect(res.body).toEqual(OWNER_ONLY);
      expect(res.text).not.toContain(KEY_WORDS);
      const { body } = await read(PAT, cloud(name)).expect(200);
      expect(body.content).toContain(KEY_WORDS);
      expect(body.ownerOnly).toBe(true);
    }
    expect((await read(SAM, cloud('secrets.example.json')).expect(200)).body.content).toBe('{ "made_up_key": "" }\n');
  });
});
