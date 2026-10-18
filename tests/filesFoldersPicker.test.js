import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The "Mount to" picker: on Alex's PC censaiOS runs in Docker and only sees
// the checkout (D:\Homebase\CensaiHub) and the projects folder. The picker
// must offer only those, in the PC's own words, and refuse anything else.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-folders-'));
const stateDir = path.join(tempRoot, 'state');
const appRoot = path.join(tempRoot, 'workspace', 'CensaiHub');
const projectsRoot = path.join(tempRoot, 'workspace', 'projects');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(path.join(appRoot, 'src'), { recursive: true });
fs.mkdirSync(path.join(appRoot, 'node_modules'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, 'shop', 'site'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, '.hidden'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, '$RECYCLE.BIN'), { recursive: true });
fs.mkdirSync(path.join(projectsRoot, 'System Volume Information'), { recursive: true });
fs.writeFileSync(path.join(projectsRoot, 'notes.txt'), 'not a folder');
process.env.CENSAI_STATE_DIR = stateDir;

const ENV_KEYS = ['HOMEBASE_CONTAINER_PROJECT_ROOT', 'HOMEBASE_HOST_PROJECT_ROOT', 'CENSAI_PROJECTS_FOLDER', 'CENSAI_PROJECTS_FOLDER_ON_PC'];
const previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let app;

const folders = (p) => request(app).get('/api/files/folders').query(p ? { path: p } : {});

beforeAll(async () => {
  process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = appRoot;
  delete process.env.HOMEBASE_HOST_PROJECT_ROOT;
  process.env.CENSAI_PROJECTS_FOLDER = projectsRoot;
  process.env.CENSAI_PROJECTS_FOLDER_ON_PC = 'D:\\Projects';
  // The board remembers the checkout the way the PC names it, plus a folder
  // Docker can't see (the cause of the broken terminal).
  fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'CensaiHub', path: 'D:\\Homebase\\CensaiHub' }));
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify(['D:\\Homebase\\CensaiHub', 'D:\\Homebase']));
  const { filesRouter } = await import('../server/routes/files/index.js');
  app = express();
  app.use('/api', filesRouter);
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
  expect(shown).toContain('D:\\Homebase\\CensaiHub');
  expect(shown).toContain('D:\\Projects');
  expect(shown).not.toContain('D:\\Homebase');
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
  expect(app2.body.folders[0].mountPath).toBe('D:\\Homebase\\CensaiHub\\src');
});

linuxOnly('refuses folders outside the places', async () => {
  expect((await folders(tempRoot)).status).toBe(403);
  expect((await folders('D:\\Homebase')).status).toBe(403);
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
