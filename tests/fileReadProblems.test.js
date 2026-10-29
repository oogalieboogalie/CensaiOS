import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A Document or Code editor reads its file through GET /api/files/content. A
// file that will not open answers with plain words and a reason the window
// turns into its own words (shared/files/fileProblems.js), never the error's
// own text, which names the server's folders. All files are made up.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-file-problems-'));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-project');
const note = path.join(project, 'notes', 'picnic.md');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(path.dirname(note), { recursive: true });
fs.writeFileSync(note, 'Made-up note');
process.env.CENSAI_STATE_DIR = stateDir;

const { filesRouter } = await import('../server/routes/files/index.js');
const { fileReadProblem, OWN_STATE } = await import('../server/routes/files/pathUtils.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');

const app = express();
app.use('/api', filesRouter);
const read = (p) => request(app).get('/api/files/content').query({ path: p });

/** The board's open projects, and its default project (none when left out). */
function setProjects(open, current) {
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify(open));
  const currentFile = path.join(stateDir, 'current-project.json');
  if (current) fs.writeFileSync(currentFile, JSON.stringify({ type: 'local', name: 'Made-up', path: current }));
  else fs.rmSync(currentFile, { force: true });
}

afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('a file that will not open says why', () => {
  beforeEach(() => setProjects([project], project));

  test('a file that is there opens', async () => {
    const res = await read(note).expect(200);
    expect(res.body.content).toBe('Made-up note');
  });

  test('a missing file is a 404 in plain words, not a 500 naming the server\'s folders', async () => {
    const res = await read(path.join(project, 'notes', 'gone.md')).expect(404);
    expect(res.body).toEqual({ error: FILE_PROBLEMS.missing, reason: 'missing' });
    expect(res.text).not.toMatch(/ENOENT|no such file/);
    expect(res.text).not.toContain(tempRoot);
  });

  test('a file whose folder is now a file is missing too', async () => {
    const res = await read(path.join(note, 'inner.md')).expect(404);
    expect(res.body.reason).toBe('missing');
  });

  test('a folder opened as a file says it is a folder', async () => {
    const res = await read(path.dirname(note)).expect(400);
    expect(res.body).toEqual({ error: FILE_PROBLEMS.folder, reason: 'folder' });
  });

  test('a file outside every open project gets one answer whether or not it exists', async () => {
    const there = await read(path.join(stateDir, 'open-projects.json')).expect(403);
    const notThere = await read(path.join(tempRoot, 'made-up-elsewhere.md')).expect(403);
    expect(there.body).toEqual({ error: FILE_PROBLEMS.outside, reason: 'outside' });
    expect(notThere.text).toBe(there.text);
  });

  test('a file that cannot be read for any other reason is a 500 in plain words, without the error\'s text', async () => {
    const res = await read(path.join(project, 'made\0up.md')).expect(500);
    expect(res.body).toEqual({ error: FILE_PROBLEMS.unreadable, reason: 'unreadable' });
    expect(res.text).not.toContain(tempRoot);
  });
});

describe('a censaiOS with its computer\'s files switched off', () => {
  beforeEach(() => { setProjects([project], project); process.env.CENSAI_LOCAL_FILES = 'off'; });
  afterEach(() => { delete process.env.CENSAI_LOCAL_FILES; });

  test('a window opening a file is told so in plain words', async () => {
    const res = await read(note).expect(403);
    expect(res.body).toEqual({ error: FILE_PROBLEMS.filesOff, reason: 'filesOff' });
  });

  test('other file routes keep their plain refusal, since their windows read a reason their own way', async () => {
    const res = await request(app).get('/api/files/browse').query({ path: project }).expect(403);
    expect(res.body.reason).toBeUndefined();
  });
});

describe('a folder opened from Files before any project is the default', () => {
  test('its files open, and files outside it stay refused', async () => {
    setProjects([project], null);
    expect((await read(note).expect(200)).body.content).toBe('Made-up note');
    expect((await read(path.join(project, 'gone.md')).expect(404)).body.reason).toBe('missing');
    expect((await read(path.join(tempRoot, 'made-up-elsewhere.md')).expect(403)).body.reason).toBe('outside');
  });

  test('with nothing opened, only the app\'s own folder opens, except its folder of keys and logins', async () => {
    setProjects([], null);
    await read(path.join(process.cwd(), 'package.json')).expect(200);
    expect((await read(note).expect(403)).body.reason).toBe('outside');
    const keys = await read(path.join(process.cwd(), '.homebase-state', 'generated-secrets.env')).expect(403);
    expect(keys.body).toEqual({ error: FILE_PROBLEMS.secret, reason: 'secret' });
  });

  test('a broken list of open projects counts as none, not as a problem with the file', async () => {
    setProjects([], null);
    fs.writeFileSync(path.join(stateDir, 'open-projects.json'), '{ made-up broken');
    await read(path.join(process.cwd(), 'package.json')).expect(200);
    expect((await read(note).expect(403)).body).toEqual({ error: FILE_PROBLEMS.outside, reason: 'outside' });
  });
});

describe("censaiOS's own folder of keys, logins and lists never opens on the board", () => {
  const secrets = path.join(stateDir, 'generated-secrets.env');
  beforeAll(() => fs.writeFileSync(secrets, 'MADE_UP_SECRET=not-a-real-one'));

  test('not even inside an open project, with one answer whether or not the file is there', async () => {
    setProjects([tempRoot], null);
    const there = await read(secrets).expect(403);
    const notThere = await read(path.join(stateDir, 'made-up-not-there.json')).expect(403);
    expect(there.body).toEqual({ error: FILE_PROBLEMS.secret, reason: 'secret' });
    expect(notThere.text).toBe(there.text);
    expect(there.text).not.toContain('MADE_UP_SECRET');
  });

  test('a folder of that name in a project, however it is written, and a link into one, are refused too', async () => {
    setProjects([project], project);
    const copy = path.join(project, '.Homebase-State');
    fs.mkdirSync(copy, { recursive: true });
    fs.writeFileSync(path.join(copy, 'generated-secrets.env'), 'MADE_UP_SECRET=not-a-real-one');
    fs.symlinkSync(secrets, path.join(project, 'made-up-link.env'));
    fs.symlinkSync(stateDir, path.join(project, 'made-up-state-link'));
    for (const asked of [
      path.join(copy, 'generated-secrets.env'),
      path.join(project, '.homebase-state.', 'made-up.json'),
      path.join(project, 'made-up-link.env'),
      path.join(project, 'made-up-state-link', 'made-up', 'deeper.json'),
    ]) {
      const res = await read(asked).expect(403);
      expect(res.body.reason).toBe('secret');
      expect(res.text).not.toContain('MADE_UP_SECRET');
    }
  });

  test('a state folder named by HOMEBASE_STATE_DIR is refused too', async () => {
    const other = path.join(tempRoot, 'made-up-other-state');
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'ai-resources.json'), '{"madeUp":true}');
    setProjects([tempRoot], null);
    process.env.HOMEBASE_STATE_DIR = other;
    try {
      const res = await read(path.join(other, 'ai-resources.json')).expect(403);
      expect(res.body.reason).toBe('secret');
    } finally {
      delete process.env.HOMEBASE_STATE_DIR;
    }
    expect((await read(path.join(other, 'ai-resources.json')).expect(200)).body.content).toBe('{"madeUp":true}');
  });

  test('Files says so in plain words, without sending anyone to the path bar', async () => {
    setProjects([tempRoot], null);
    const res = await request(app).get('/api/files/browse').query({ path: stateDir }).expect(403);
    expect(res.body.error).toBe('censaiOS keeps its own keys and logins in this folder, so it does not open on the board.');
  });
});

describe('fileReadProblem', () => {
  test.each([
    [{ code: OWN_STATE }, 403, 'secret'],
    [{ code: 'ENOENT' }, 404, 'missing'],
    [{ code: 'ENOTDIR' }, 404, 'missing'],
    [{ code: 'EISDIR' }, 400, 'folder'],
    [{ code: 'EACCES' }, 403, 'denied'],
    [{ code: 'EPERM' }, 403, 'denied'],
    [new Error('Access denied: Path is outside the current project root'), 403, 'outside'],
    [{ code: 'EMFILE', message: '/made/up/server/folder' }, 500, 'unreadable'],
    [{ code: 'constructor' }, 500, 'unreadable'],
    [null, 500, 'unreadable'],
  ])('%o is %i %s, in plain words', (err, status, reason) => {
    expect(fileReadProblem(err)).toEqual({ status, reason, error: FILE_PROBLEMS[reason] });
  });
});
