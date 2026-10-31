import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// A Save (PUT /api/files/content) writes a whole new copy next to the file
// and swaps it in only once it is whole (server/routes/files/saveWhole.js),
// so a Save that fails leaves the file as it was. Made-up people: Pat Example
// owns this computer and Sam Example is a teammate. All files are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
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

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-save-whole-'));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-project');
const notes = path.join(project, 'notes');
const note = path.join(notes, 'made-up-plan.md');
fs.mkdirSync(stateDir, { recursive: true });
process.env.CENSAI_STATE_DIR = stateDir;

const { browserRouter } = await import('../server/routes/files/browser.js');
const { SAVE_PROBLEMS } = await import('../shared/files/fileProblems.js');

// Taken before any test stands in for them.
const real = { writeFile: fs.promises.writeFile, chown: fs.promises.chown, rename: fs.promises.rename, access: fs.promises.access };
const asRoot = process.getuid?.() === 0;

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter);
  return a;
}
const save = (asked, content = 'Made-up words saved', more = {}) => request(app(PAT)).put('/api/files/content').send({ path: asked, content, ...more });
const refusal = (code) => Object.assign(new Error(`${code}: made-up refusal`), { code });
const inNotes = () => fs.readdirSync(notes).sort();

/** A disk that fills up partway: the first few words reach the file, then the write stops. */
function diskFillsPartway() {
  jest.spyOn(fs.promises, 'writeFile').mockImplementationOnce(async (file, data, options) => {
    await real.writeFile(file, String(data).slice(0, 5), options);
    throw refusal('ENOSPC');
  });
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

describe('a Save that fails leaves the file as it was', () => {
  test('a disk that fills up partway leaves the file whole, with nothing left beside it', async () => {
    diskFillsPartway();
    const res = await save(note, 'Made-up words that do not fit').expect(507);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.full, reason: 'full' });
    expect(res.body.error).toMatch(/The file on disk is as it was/);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
    expect(inNotes()).toEqual(['made-up-plan.md']);
    expect(logged).toEqual(['warn content: a file could not be saved (ENOSPC)']);
  });

  test('a new file cut short by a full disk is removed again', async () => {
    const fresh = path.join(notes, 'made-up-new.md');
    diskFillsPartway();
    await save(fresh, '# Made-up new', { create: true }).expect(507);
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });

  test('a whole Save swaps the new words in, with nothing left beside the file', async () => {
    const before = fs.statSync(note);
    await save(note).expect(200);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
    expect(fs.statSync(note).ino).not.toBe(before.ino);
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });
});

describe('the file keeps what it had', () => {
  test('a link keeps leading where it did, and the file it leads to takes the words', async () => {
    const link = path.join(notes, 'made-up-link.md');
    fs.symlinkSync('made-up-plan.md', link);
    await save(link).expect(200);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('made-up-plan.md');
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
    expect(inNotes()).toEqual(['made-up-link.md', 'made-up-plan.md']);
  });

  test('the file keeps its permissions', async () => {
    fs.chmodSync(note, 0o640);
    await save(note).expect(200);
    expect(fs.statSync(note).mode & 0o7777).toBe(0o640);
  });

  (asRoot ? test : test.skip)('a file owned by another account keeps its owner and group', async () => {
    fs.chownSync(note, 4242, 4243);
    fs.chmodSync(note, 0o664);
    await save(note).expect(200);
    const after = fs.statSync(note);
    expect([after.uid, after.gid, after.mode & 0o7777]).toEqual([4242, 4243, 0o664]);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
  });

  test('when the copy cannot take the owner, the Save writes in place as before, so the owner stays', async () => {
    const before = fs.statSync(note);
    jest.spyOn(fs.promises, 'chown').mockRejectedValueOnce(refusal('EPERM'));
    await save(note).expect(200);
    const after = fs.statSync(note);
    expect([after.ino, after.uid, after.gid]).toEqual([before.ino, before.uid, before.gid]);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
    expect(inNotes()).toEqual(['made-up-plan.md']);
    expect(logged).toEqual([]);
  });

  test('a Save written in place on a full disk says the file may be cut short', async () => {
    fs.linkSync(note, path.join(notes, 'made-up-other-name.md'));
    jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(refusal('ENOSPC'));
    const res = await save(note).expect(507);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.fullCutShort, reason: 'fullCutShort' });
    expect(res.body.error).toMatch(/may now be cut short/);
  });

  test('a file with a second name (a hard link) is written in place, so both names keep the same words', async () => {
    const other = path.join(notes, 'made-up-other-name.md');
    fs.linkSync(note, other);
    await save(note).expect(200);
    expect(fs.readFileSync(other, 'utf8')).toBe('Made-up words saved');
    expect(fs.statSync(other).ino).toBe(fs.statSync(note).ino);
  });
});

describe('where a copy cannot stand in, the Save works as before', () => {
  test('a folder that takes no new files still saves a file that takes words, in place', async () => {
    const before = fs.statSync(note);
    jest.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(refusal('EACCES'));
    await save(note).expect(200);
    expect(fs.statSync(note).ino).toBe(before.ino);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });

  test('a swap this computer refuses (the file held open elsewhere) writes in place', async () => {
    const before = fs.statSync(note);
    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(refusal('EBUSY'));
    await save(note).expect(200);
    expect(fs.statSync(note).ino).toBe(before.ino);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up words saved');
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });

  test('a file this server may not write stays refused, though its folder would take a copy', async () => {
    const where = fs.realpathSync(note);
    jest.spyOn(fs.promises, 'access').mockImplementation((file, mode) => (file === where ? Promise.reject(refusal('EACCES')) : real.access(file, mode)));
    const res = await save(note).expect(403);
    expect(res.body).toEqual({ error: SAVE_PROBLEMS.denied, reason: 'denied' });
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });

  test('a full disk at the swap is never answered by writing in place', async () => {
    const writes = jest.spyOn(fs.promises, 'writeFile');
    jest.spyOn(fs.promises, 'rename').mockRejectedValueOnce(refusal('ENOSPC'));
    await save(note).expect(507);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(note, 'utf8')).toBe('Made-up plan');
    expect(inNotes()).toEqual(['made-up-plan.md']);
  });
});
