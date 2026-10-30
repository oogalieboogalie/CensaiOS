import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A Document or Code editor saves its file through PUT /api/files/content. A
// save that did not happen answers with plain words and a reason the window
// turns into its own words (shared/files/fileProblems.js), never the error's
// own text, which names the server's folders. Made-up people: Pat Example owns
// this computer and Sam Example is a teammate. All files are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const [PAT, SAM] = [1, 2];
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
const logged = [];
const record = (level) => (message) => logged.push(`${level} ${message}`);
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));
jest.unstable_mockModule('../server/logger.js', () => ({
  createLogger: () => ({ error: record('error'), warn: record('warn'), info: record('info'), debug: () => {}, trace: () => {} }),
  redactUrl: (url) => url,
  writeLogRecord: () => {},
  onLogRecord: () => () => {},
}));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-save-problems-'));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-project');
const notes = path.join(project, 'notes');
const note = path.join(notes, 'made-up-plan.md');
fs.mkdirSync(stateDir, { recursive: true });
process.env.CENSAI_STATE_DIR = stateDir;

const { browserRouter } = await import('../server/routes/files/browser.js');
const { fileWriteProblem, OWN_STATE } = await import('../server/routes/files/pathUtils.js');
const { SAVE_PROBLEMS, saveProblemWords } = await import('../shared/files/fileProblems.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter);
  return a;
}
const save = (asked, who = PAT, content = 'Made-up words saved', more = {}) => request(app(who)).put('/api/files/content').send({ path: asked, content, ...more });
const failWrite = (code) => jest.spyOn(fs.promises, 'writeFile')
  .mockRejectedValueOnce(Object.assign(new Error(`${code || 'made-up failure'}: open '${note}'`), code ? { code } : {}));

/** What the answer must never carry: the server's folders or its error's own words. */
function expectNoServerWords(res) {
  expect(res.text).not.toContain(tempRoot);
  expect(res.text).not.toMatch(/ENOENT|ENOTDIR|EISDIR|EACCES|EBUSY|ENOSPC|EIO|no such file|illegal operation|Access denied/);
}

beforeEach(() => {
  fs.rmSync(project, { recursive: true, force: true });
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(note, 'Made-up plan');
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([project]));
  logged.length = 0;
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('a save that did not happen says why', () => {
  test('a save in a project open on the board writes the file', async () => {
    const res = await save(note).expect(200);
    expect(res.body).toEqual({ ok: true, path: note });
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
  });

  test('a file whose folder was moved away is a 404 in plain words, and the folder is not made again', async () => {
    fs.renameSync(notes, `${notes}-moved-away`);
    const res = await save(note).expect(404);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.gone, reason: 'gone' });
    expectNoServerWords(res);
    expect(fs.existsSync(notes)).toBe(false);
  });

  test('a file whose folder is now a file is gone too', async () => {
    const res = await save(path.join(note, 'inner.md')).expect(404);
    expect(res.body.reason).toBe('gone');
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
  });

  test('a file that is now a folder says so', async () => {
    fs.rmSync(note);
    fs.mkdirSync(note);
    const res = await save(note).expect(400);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.folder, reason: 'folder' });
    expectNoServerWords(res);
  });

  test.each([
    ['EACCES', 403, 'denied'],
    ['EPERM', 403, 'denied'],
    ['EROFS', 403, 'denied'],
    ['EBUSY', 409, 'busy'],
  ])('%s from this computer is %i %s in plain words, and logs nothing', async (code, status, reason) => {
    failWrite(code);
    const res = await save(note).expect(status);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS[reason], reason });
    expectNoServerWords(res);
    expect(logged).toEqual([]);
  });

  test.each([
    ['ENOSPC', 507, 'full'],
    ['EIO', 500, 'unsaved'],
    [undefined, 500, 'unsaved'],
  ])('%s is %i %s in plain words, logged with its code only', async (code, status, reason) => {
    failWrite(code);
    const res = await save(note).expect(status);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS[reason], reason });
    expectNoServerWords(res);
    expect(logged).toEqual([`warn content: a file could not be saved (${code || 'no code'})`]);
  });

  test('a file outside every project open on the board is refused, writes nothing and names no folder', async () => {
    const outside = path.join(tempRoot, 'made-up-elsewhere.md');
    const res = await save(outside).expect(403);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.outside, reason: 'outside' });
    expectNoServerWords(res);
    expect(fs.existsSync(outside)).toBe(false);
  });

  test("a file in censaiOS's own folder of keys and logins is refused, even inside a project", async () => {
    const keys = path.join(project, '.homebase-state', 'made-up.env');
    fs.mkdirSync(path.dirname(keys));
    const res = await save(keys).expect(403);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.secret, reason: 'secret' });
    expect(fs.existsSync(keys)).toBe(false);
  });

  test('a new file only (Files\' New file, a note a link asks for) is made, and one already there is never written over', async () => {
    const fresh = path.join(notes, 'made-up-new.md');
    expect((await save(fresh, PAT, '# Made-up new', { create: true }).expect(200)).body.ok).toBe(true);
    expect(fs.readFileSync(fresh, 'utf8')).toBe('# Made-up new');
    const res = await save(note, PAT, '', { create: true }).expect(409);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.exists, reason: 'exists' });
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
    expect(logged).toEqual([]);
  });

  test('anything but create: true writes over the file as a Save does', async () => {
    await save(note, PAT, 'Made-up words saved', { create: 'yes' }).expect(200);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
  });

  test("a teammate's save is refused with the reason the windows say in plain words, and writes nothing", async () => {
    const res = await save(note, SAM).expect(403);
    expect(res.body.reason).toBe('owner-only');
    expect(saveProblemWords(res.body.reason)).toBe(SAVE_PROBLEMS.ownerOnly);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
  });
});

describe.each([
  ['switched off', { CENSAI_LOCAL_FILES: 'off' }],
  ['run as a cloud service', { CENSAI_MODE: 'cloud_saas' }],
  ['run as a private server without local files', { CENSAI_MODE: 'private_server', HOMEBASE_ALLOW_LOCAL_FILES: 'false' }],
])("a censaiOS with its computer's files off (%s)", (_how, env) => {
  const before = {};
  beforeEach(() => {
    for (const key of Object.keys(env)) before[key] = process.env[key];
    Object.assign(process.env, env);
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test.each([[PAT], [SAM]])('a save by %p is told so in plain words and writes nothing', async (who) => {
    const res = await save(note, who).expect(403);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.filesOff, reason: 'filesOff' });
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
  });
});

describe('fileWriteProblem', () => {
  test.each([
    [{ code: 'ENOENT' }, 404, 'gone'],
    [{ code: 'ENOTDIR' }, 404, 'gone'],
    [{ code: 'EISDIR' }, 400, 'folder'],
    [{ code: 'EEXIST' }, 409, 'exists'],
    [{ code: 'EACCES' }, 403, 'denied'],
    [{ code: 'EPERM' }, 403, 'denied'],
    [{ code: 'EROFS' }, 403, 'denied'],
    [{ code: 'EBUSY' }, 409, 'busy'],
    [{ code: 'ETXTBSY' }, 409, 'busy'],
    [{ code: 'ENOSPC' }, 507, 'full'],
    [{ code: 'EDQUOT' }, 507, 'full'],
    [{ code: OWN_STATE }, 403, 'secret'],
    [new Error('Access denied: Path is outside the current project root'), 403, 'outside'],
    [{ code: 'EMFILE', message: '/made/up/server/folder' }, 500, 'unsaved'],
    [{ code: 'constructor' }, 500, 'unsaved'],
    [null, 500, 'unsaved'],
  ])('%o is %i %s, in words the windows know', (err, status, reason) => {
    const problem = fileWriteProblem(err);
    expect(problem).toEqual({ status, reason, error: SAVE_PROBLEMS[reason] });
    expect(saveProblemWords(problem.reason)).toBe(problem.error);
    expect(problem.error).toEqual(expect.any(String));
  });
});
