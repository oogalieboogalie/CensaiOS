import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// While no project is open on the board, Files falls back to censaiOS's own
// folder (the app's checkout). That stays this computer's owner's: a
// teammate's Files offers only the projects open on the board, as the folder
// picker does. Pat Example owns the computer, Sam Example is a teammate. The
// project and its note are made up; censaiOS's own folder is this checkout,
// which the tests only read.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-app-folder-')));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-project');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(project, { recursive: true });
fs.writeFileSync(path.join(project, 'made-up-note.md'), 'Made-up note in an open project');
process.env.CENSAI_STATE_DIR = stateDir;

const appFolder = path.resolve(process.cwd());
const openProjects = (list) => fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify(list));
const currentProject = (folder) => {
  const file = path.join(stateDir, 'current-project.json');
  if (folder) fs.writeFileSync(file, JSON.stringify({ path: folder }));
  else fs.rmSync(file, { force: true });
};

const { browserRouter } = await import('../server/routes/files/browser.js');
const { projectGitRouter } = await import('../server/routes/projectGit.js');
const { FILE_PROBLEMS } = await import('../shared/files/fileProblems.js');

function app(userId) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter);
  a.use('/api/project-git', projectGitRouter);
  return a;
}
const get = (who, route, query = {}) => request(app(who)).get(route).query(query);
const names = (res) => (res.body.children || []).map((c) => c.name);
const OWNER_FOLDER = "Only this computer's owner can open this folder.";

beforeEach(() => {
  openProjects([project]);
  currentProject(null);
});

afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("with no project open, censaiOS's own folder is the owner's", () => {
  test('Files with no folder named: the owner gets censaiOS\'s own folder, a teammate a refusal', async () => {
    const pat = await get(PAT, '/api/files/browse');
    expect(pat.status).toBe(200);
    expect(names(pat)).toContain('package.json');

    const sam = await get(SAM, '/api/files/browse');
    expect(sam.status).toBe(403);
    // reason "outside": the Finder says the folder is not in a project open on this board.
    expect(sam.body).toEqual({ error: OWNER_FOLDER, reason: 'outside' });
    expect(JSON.stringify(sam.body)).not.toContain('package.json');
  });

  test('a teammate cannot list, read or search in it by its path either', async () => {
    const folder = path.join(appFolder, 'server');
    const file = path.join(appFolder, 'package.json');
    for (const route of ['/api/files/browse', '/api/files/relist']) {
      const sam = await get(SAM, route, { path: folder });
      expect(sam.status).toBe(403);
      expect(sam.body).toEqual({ error: OWNER_FOLDER, reason: 'outside' });
    }
    // A file there is not in a project open on this board, which is what the
    // Document and Code editor windows then say.
    const read = await get(SAM, '/api/files/content', { path: file });
    expect(read.status).toBe(403);
    expect(read.body).toEqual({ error: FILE_PROBLEMS.outside, reason: 'outside' });
    expect(JSON.stringify(read.body)).not.toContain('censai-hub');
    for (const query of [{ q: 'package' }, { q: 'package', path: appFolder }]) {
      const search = await get(SAM, '/api/files/search', query);
      expect(search.status).toBe(403);
      expect(search.body).toEqual({ error: OWNER_FOLDER });
    }
    const backlinks = await get(SAM, '/api/files/backlinks', { path: path.join(appFolder, 'made-up-note.md') });
    expect(backlinks.status).toBe(403);
    expect(backlinks.body).toEqual({ error: OWNER_FOLDER });
    expect((await get(SAM, '/api/files/image', { path: path.join(appFolder, 'made-up-picture.png') })).status).toBe(403);
  });

  test('the owner still lists, reads and searches it, and its words stay on the owner\'s screen', async () => {
    expect(names(await get(PAT, '/api/files/browse', { path: path.join(appFolder, 'server') }))).toContain('routes');
    const read = await get(PAT, '/api/files/content', { path: path.join(appFolder, 'package.json') });
    expect(read.status).toBe(200);
    expect(read.body.content).toContain('"name"');
    // ownerOnly: the owner's window keeps them off the shared board, as for a file that holds keys.
    expect(read.body.ownerOnly).toBe(true);
    const found = await get(PAT, '/api/files/search', { q: 'package.json' });
    expect(found.status).toBe(200);
    expect(found.body.results.length).toBeGreaterThan(0);
    const backlinks = await get(PAT, '/api/files/backlinks', { path: path.join(appFolder, 'made-up-note.md') });
    expect(backlinks.status).toBe(200);
  });

  test("a teammate's version bar is refused censaiOS's own folder too", async () => {
    const sam = await get(SAM, '/api/project-git/status', { path: appFolder });
    expect(sam.status).toBe(403);
    expect(sam.body.error).toBe(`${appFolder} isn't a project open on this board.`);
  });

  test('a teammate still gets the projects open on the board', async () => {
    const sam = await get(SAM, '/api/files/browse', { path: project });
    expect(sam.status).toBe(200);
    expect(names(sam)).toEqual(['made-up-note.md']);
    const read = await get(SAM, '/api/files/content', { path: path.join(project, 'made-up-note.md') });
    expect(read.body.content).toBe('Made-up note in an open project');
  });

  test("with a project open, Files starts there for everyone, and censaiOS's own folder is refused as before", async () => {
    currentProject(project);
    for (const who of [PAT, SAM]) {
      const listed = await get(who, '/api/files/browse');
      expect(listed.status).toBe(200);
      expect(names(listed)).toEqual(['made-up-note.md']);
    }
    const sam = await get(SAM, '/api/files/browse', { path: appFolder });
    expect(sam.status).toBe(403);
    expect(sam.body.reason).toBe('outside');
  });

  test("when censaiOS's own folder is itself a project open on the board, a teammate gets it like any other", async () => {
    openProjects([project, appFolder]);
    const sam = await get(SAM, '/api/files/browse', { path: appFolder });
    expect(sam.status).toBe(200);
    expect(names(sam)).toContain('package.json');
    for (const who of [PAT, SAM]) {
      const read = await get(who, '/api/files/content', { path: path.join(appFolder, 'package.json') });
      expect(read.status).toBe(200);
      expect(read.body.ownerOnly).toBeUndefined();
    }
  });
});
