import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The "Mount to" picker: on the owner's PC censaiOS runs in Docker and only sees
// the checkout (D:\Repos\CensaiHub) and the projects folder. The picker
// must offer only those, in the PC's own words, and refuse anything else.
// Pretend people, never real ones: Pat owns this computer, Sam is a teammate.
const PAT = 1;
const SAM = 2;
const PEOPLE = { [PAT]: { role: 'admin' }, [SAM]: { role: 'user' } };
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-folders-'));
const stateDir = path.join(tempRoot, 'state');
const appRoot = path.join(tempRoot, 'workspace', 'CensaiHub');
const projectsRoot = path.join(tempRoot, 'workspace', 'projects');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(path.join(appRoot, 'src'), { recursive: true });
fs.mkdirSync(path.join(appRoot, 'node_modules'), { recursive: true });
fs.mkdirSync(path.join(appRoot, '.git', 'hooks'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, 'shop', 'site'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, '.hidden'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, '$RECYCLE.BIN'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, 'System Volume Information'), { recursive: true });
fs.writeFileSync(path.join(projectsRoot, 'notes.txt'), 'not a folder');
// A link in the open project that leads out of it, to the projects folder.
fs.symlinkSync(projectsRoot, path.join(appRoot, 'linked-out'), 'dir');
process.env.CENSAI_STATE_DIR = stateDir;

const ENV_KEYS = ['HOMEBASE_CONTAINER_PROJECT_ROOT', 'HOMEBASE_HOST_PROJECT_ROOT', 'CENSAI_PROJECTS_FOLDER', 'CENSAI_PROJECTS_FOLDER_ON_PC', 'CENSAI_LEGION_DIR'];
const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let filesRouter;

function appFor(userId) {
  const app = express();
  app.use((req, _res, next) => { req.session = { userId }; next(); });
  app.use('/api', filesRouter);
  return app;
}
const folders = (p, who = PAT) => request(appFor(who)).get('/api/files/folders').query(p ? { path: p } : {});

beforeAll(async () => {
  process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = appRoot;
  delete process.env.HOMEBASE_HOST_PROJECT_ROOT;
  process.env.CENSAI_PROJECTS_FOLDER = projectsRoot;
  process.env.CENSAI_PROJECTS_FOLDER_ON_PC = 'D:\\Projects';
  // The board remembers the checkout the way the PC names it, plus a folder
  // Docker can't see (the cause of the broken terminal).
  fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'CensaiHub', path: 'D:\\Repos\\CensaiHub' }));
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify(['D:\\Repos\\CensaiHub', 'D:\\Repos']));
  ({ filesRouter } = await import('../server/routes/files/index.js'));
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (previous[k] === undefined) delete process.env[k];
    else process.env[k] = previous[k];
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

const linuxOnly = process.platform === 'win32' ? test.skip : test;

linuxOnly('offers only the places censaiOS can reach', async () => {
  const res = await folders();
  expect(res.status).toBe(200);
  const shown = res.body.places.map((p) => p.mountPath);
  expect(shown).toContain('D:\\Repos\\CensaiHub');
  expect(shown).toContain('D:\\Projects');
  expect(shown).not.toContain('D:\\Repos');
});

linuxOnly('lists subfolders only, in the PC\'s own words', async () => {
  const res = await folders(projectsRoot);
  expect(res.status).toBe(200);
  expect(res.body.parent).toBeNull();
  expect(res.body.mountPath).toBe('D:\\Projects');
  expect(res.body.folders).toEqual([{ name: 'shop', path: path.join(projectsRoot, 'shop'), mountPath: 'D:\\Projects\\shop' }]);

  const shop = await folders('D:\\Projects\\shop');
  expect(shop.status).toBe(200);
  expect(shop.body.parent).toBe(projectsRoot);
  expect(shop.body.folders.map((f) => f.mountPath)).toEqual(['D:\\Projects\\shop\\site']);

  const app2 = await folders(appRoot);
  expect(app2.body.folders.map((f) => f.name)).toEqual(['src']);
  expect(app2.body.folders[0].mountPath).toBe('D:\\Repos\\CensaiHub\\src');
});

linuxOnly('refuses folders outside the places', async () => {
  expect((await folders(tempRoot)).status).toBe(403);
  expect((await folders('D:\\Repos')).status).toBe(403);
  expect((await folders('/etc')).status).toBe(403);
});

linuxOnly('a whole shared drive skips Windows system folders and reads as "D: drive"', async () => {
  const res = await folders('D:\\Projects');
  const names = res.body.folders.map((f) => f.name);
  expect(names).not.toContain('$RECYCLE.BIN');
  expect(names).not.toContain('System Volume Information');
  const { folderPlaces } = await import('../server/routes/files/folders.js');
  const places = await folderPlaces({ CENSAI_PROJECTS_FOLDER: projectsRoot, CENSAI_PROJECTS_FOLDER_ON_PC: 'D:/', HOMEBASE_CONTAINER_PROJECT_ROOT: appRoot });
  expect(places.find((p) => p.root === path.resolve(projectsRoot))).toMatchObject({ name: 'D: drive', stored: 'D:/' });
});

// A teammate's picker offers only the projects open on the board (the
// folders Files already shows them); the rest of this computer's folders are
// the owner's, refused in the same words whether or not they are there.
describe('a teammate', () => {
  let REFUSAL;
  beforeAll(async () => { ({ TEAMMATE_FOLDER_REFUSAL: REFUSAL } = await import('../server/routes/files/folders.js')); });

  linuxOnly('is offered only the projects open on the board', async () => {
    const res = await folders('', SAM);
    expect(res.status).toBe(200);
    expect(res.body.places).toEqual([{ name: 'CensaiHub', path: path.resolve(appRoot), mountPath: 'D:\\Repos\\CensaiHub' }]);
    expect(res.body.openProjectsOnly).toBe(true);
  });

  linuxOnly('lists the folders in an open project', async () => {
    const root = await folders('D:\\Repos\\CensaiHub', SAM);
    expect(root.status).toBe(200);
    expect(root.body.parent).toBeNull();
    expect(root.body.folders.map((f) => f.mountPath)).toEqual(['D:\\Repos\\CensaiHub\\src']);
    const src = await folders(path.join(appRoot, 'src'), SAM);
    expect(src.status).toBe(200);
    expect(src.body.mountPath).toBe('D:\\Repos\\CensaiHub\\src');
  });

  linuxOnly.each([
    ['the projects folder', projectsRoot],
    ['the projects folder in the PC\'s words', 'D:\\Projects'],
    ['a folder in it', 'D:\\Projects\\shop'],
    ['a folder that is not there', 'D:\\Projects\\made-up-nowhere'],
    ['a folder censaiOS cannot reach', '/etc'],
    ['the folder above the open project', path.dirname(appRoot)],
    ['a link out of the open project', path.join(appRoot, 'linked-out')],
    ['a folder through that link', path.join(appRoot, 'linked-out', 'shop')],
    ['a hidden folder in the open project', path.join(appRoot, '.git')],
    ['a folder inside that hidden folder', path.join(appRoot, '.git', 'hooks')],
  ])('is refused %s, in plain words', async (_what, asked) => {
    const res = await folders(asked, SAM);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: REFUSAL,
      reason: 'owner-only',
      code: 'computer_owner_only',
      openProjectsOnly: true,
      places: [{ name: 'CensaiHub', path: path.resolve(appRoot), mountPath: 'D:\\Repos\\CensaiHub' }],
    });
  });

  linuxOnly("is refused censaiOS's own folders inside an open project, as Files refuses them", async () => {
    const own = path.join(appRoot, 'made-up-agent-rooms');
    fs.mkdirSync(path.join(own, 'room-1'), { recursive: true });
    process.env.CENSAI_LEGION_DIR = own;
    try {
      for (const asked of [own, path.join(own, 'room-1')]) {
        const res = await folders(asked, SAM);
        expect(res.status).toBe(403);
        expect(res.body.error).toBe(REFUSAL);
      }
    } finally {
      delete process.env.CENSAI_LEGION_DIR;
      fs.rmSync(own, { recursive: true, force: true });
    }
  });

  linuxOnly("is not offered a project open inside another one's hidden folder, as Files does not show it", async () => {
    const nested = path.join(appRoot, '.claude', 'worktrees', 'made-up-tree');
    fs.mkdirSync(path.join(nested, 'src'), { recursive: true });
    const openFile = path.join(stateDir, 'open-projects.json');
    const before = fs.readFileSync(openFile, 'utf8');
    fs.writeFileSync(openFile, JSON.stringify([...JSON.parse(before), nested]));
    try {
      expect((await folders('', SAM)).body.places.map((p) => p.mountPath)).toEqual(['D:\\Repos\\CensaiHub']);
      expect((await folders(nested, SAM)).body.error).toBe(REFUSAL);
      expect((await folders(path.join(nested, 'src'), SAM)).status).toBe(403);
      // The owner is offered it, as before.
      expect((await folders('', PAT)).body.places.map((p) => p.path)).toContain(nested);
    } finally {
      fs.writeFileSync(openFile, before);
      fs.rmSync(path.join(appRoot, '.claude'), { recursive: true, force: true });
    }
  });

  linuxOnly('is refused a link in a project open inside another one that leads out of it', async () => {
    const inner = path.join(appRoot, 'made-up-inner');
    fs.mkdirSync(inner, { recursive: true });
    fs.symlinkSync(path.join(appRoot, 'src'), path.join(inner, 'made-up-link'), 'dir');
    const openFile = path.join(stateDir, 'open-projects.json');
    const before = fs.readFileSync(openFile, 'utf8');
    fs.writeFileSync(openFile, JSON.stringify([...JSON.parse(before), inner]));
    try {
      expect((await folders(inner, SAM)).status).toBe(200);
      const res = await folders(path.join(inner, 'made-up-link'), SAM);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(REFUSAL);
    } finally {
      fs.writeFileSync(openFile, before);
      fs.rmSync(inner, { recursive: true, force: true });
    }
  });

  linuxOnly("with no project open on the board, is offered no folder and refused censaiOS's own folder", async () => {
    const current = path.join(stateDir, 'current-project.json');
    const openFile = path.join(stateDir, 'open-projects.json');
    const kept = [current, openFile].map((f) => fs.readFileSync(f, 'utf8'));
    fs.rmSync(current);
    fs.writeFileSync(openFile, '[]');
    // censaiOS's own folder, the one Files falls back to while no project is open.
    process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = process.cwd();
    try {
      expect((await folders('', SAM)).body).toEqual({ places: [], openProjectsOnly: true });
      const app = await folders(process.cwd(), SAM);
      expect(app.status).toBe(403);
      expect(app.body.error).toBe(REFUSAL);
      expect((await folders('', PAT)).body.places.map((p) => p.path)).toContain(path.resolve(process.cwd()));
    } finally {
      fs.writeFileSync(current, kept[0]);
      fs.writeFileSync(openFile, kept[1]);
      process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = appRoot;
    }
  });

  linuxOnly('a listing that fails still says which places are offered', async () => {
    const failing = jest.spyOn(fs.promises, 'readdir').mockRejectedValueOnce(Object.assign(new Error('made-up refusal'), { code: 'EACCES' }));
    try {
      const res = await folders('D:\\Repos\\CensaiHub', SAM);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: 'censaiOS couldn\'t list that folder right now.',
        places: [{ name: 'CensaiHub', path: path.resolve(appRoot), mountPath: 'D:\\Repos\\CensaiHub' }],
        openProjectsOnly: true,
      });
    } finally {
      failing.mockRestore();
    }
  });

  linuxOnly('signed out, gets the same as a teammate', async () => {
    expect((await folders(projectsRoot, null)).body.error).toBe(REFUSAL);
    expect((await folders('', null)).body.places.map((p) => p.mountPath)).toEqual(['D:\\Repos\\CensaiHub']);
  });
});

describe("the computer's owner", () => {
  linuxOnly('still gets every place, without the teammate note', async () => {
    const res = await folders('', PAT);
    expect(res.body.places.map((p) => p.mountPath)).toEqual(['D:\\Repos\\CensaiHub', 'D:\\Projects']);
    expect(res.body).not.toHaveProperty('openProjectsOnly');
  });

  linuxOnly('still opens the folders a teammate is refused', async () => {
    expect((await folders('D:\\Projects\\shop', PAT)).status).toBe(200);
    expect((await folders(path.join(appRoot, 'linked-out'), PAT)).body.folders.map((f) => f.name)).toEqual(['shop']);
    expect((await folders(path.join(appRoot, '.git'), PAT)).body.folders.map((f) => f.name)).toEqual(['hooks']);
    expect((await folders('/etc', PAT)).body.error).toBe('censaiOS can\'t reach that folder from here.');
  });

  linuxOnly('when the account cannot be checked, nobody is shown any folder', async () => {
    pool.query.mockRejectedValueOnce(Object.assign(new Error('made-up database hiccup'), { code: 'ECONNREFUSED' }));
    const res = await folders(projectsRoot, PAT);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'censaiOS couldn\'t list that folder right now.' });
  });
});
