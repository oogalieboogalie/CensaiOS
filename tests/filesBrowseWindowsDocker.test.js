import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The owner's PC: censaiOS runs in Docker on Windows. The board remembers
// D:\Repos\CensaiHub, and the container sees that checkout at
// /workspace/CensaiHub. The file tree must open nested folders and move
// between them using the Windows paths the user sees.
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'censai-browse-'));
const stateDir = path.join(tempRoot, 'state');
const containerRoot = path.join(tempRoot, 'workspace', 'CensaiHub');
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(path.join(containerRoot, 'src', 'deep'), { recursive: true });
fs.mkdirSync(path.join(containerRoot, 'empty'), { recursive: true });
fs.writeFileSync(path.join(containerRoot, 'README.md'), 'hi');
fs.writeFileSync(path.join(containerRoot, 'src', 'deep', 'notes.txt'), 'deep');
process.env.CENSAI_STATE_DIR = stateDir;

const HOST = 'D:\\Repos\\CensaiHub';
const previous = {
  container: process.env.HOMEBASE_CONTAINER_PROJECT_ROOT,
  host: process.env.HOMEBASE_HOST_PROJECT_ROOT,
};

let app;

function setProject(projectPath) {
  fs.writeFileSync(path.join(stateDir, 'current-project.json'), JSON.stringify({ type: 'local', name: 'CensaiHub', path: projectPath }));
  fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([projectPath]));
}

const browse = (p) => request(app).get('/api/files/browse').query({ path: p });
const runsOnWindows = process.platform === 'win32';
const linuxOnly = runsOnWindows ? test.skip : test;

beforeAll(async () => {
  process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = containerRoot;
  delete process.env.HOMEBASE_HOST_PROJECT_ROOT;
  const { filesRouter } = await import('../server/routes/files/index.js');
  app = express();
  app.use('/api', filesRouter);
});

afterAll(() => {
  if (previous.container === undefined) delete process.env.HOMEBASE_CONTAINER_PROJECT_ROOT;
  else process.env.HOMEBASE_CONTAINER_PROJECT_ROOT = previous.container;
  if (previous.host !== undefined) process.env.HOMEBASE_HOST_PROJECT_ROOT = previous.host;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('file tree on Windows + Docker', () => {
  beforeEach(() => setProject(HOST));

  linuxOnly('lists the project with Windows paths for every child', async () => {
    const res = await browse(HOST).expect(200);
    expect(res.body.path).toBe(HOST);
    expect(res.body.parent).toBe('D:\\Repos');
    expect(res.body.children.map(c => [c.name, c.isDir, c.path])).toEqual([
      ['empty', true, `${HOST}\\empty`],
      ['src', true, `${HOST}\\src`],
      ['README.md', false, `${HOST}\\README.md`],
    ]);
  });

  linuxOnly('opens folders inside folders, two levels down', async () => {
    const src = (await browse(HOST).expect(200)).body.children.find(c => c.name === 'src');
    const deep = (await browse(src.path).expect(200)).body.children.find(c => c.name === 'deep');
    expect(deep.path).toBe(`${HOST}\\src\\deep`);
    const files = (await browse(deep.path).expect(200)).body.children;
    expect(files).toEqual([{ name: 'notes.txt', isDir: false, path: `${HOST}\\src\\deep\\notes.txt` }]);
  });

  linuxOnly('opens a nested folder even when the board project is its parent folder', async () => {
    // The board project is D:\Repos\CensaiHub\src (a folder inside the checkout).
    setProject(`${HOST}\\src`);
    const res = await browse(`${HOST}\\src`).expect(200);
    expect(res.body.children.map(c => c.name)).toEqual(['deep']);
  });

  linuxOnly('accepts forward slashes in a Windows path', async () => {
    const res = await browse('D:/Repos/CensaiHub/src').expect(200);
    expect(res.body.children.map(c => c.name)).toEqual(['deep']);
  });

  test('an empty folder answers with no children, not an error', async () => {
    const res = await browse(`${HOST}\\empty`);
    if (!runsOnWindows) expect(res.status).toBe(200);
    if (res.status === 200) expect(res.body.children).toEqual([]);
  });

  linuxOnly('a folder Docker cannot see says so in plain words', async () => {
    setProject('D:\\Archive');
    const res = await browse('D:\\Archive').expect(404);
    expect(res.body.error).toMatch(/can't see D:\\Archive/);
    expect(res.body.reason).toBe('unseen');
  });

  linuxOnly('a folder deleted from the shared checkout is gone, not out of sight', async () => {
    const res = await browse(`${HOST}\\made-up-gone`).expect(404);
    expect(res.body.reason).toBe('missing');
    expect(res.body.error).toMatch(/doesn't exist/);
    expect(res.body.error).not.toMatch(/can't see|CENSAI_PROJECTS_FOLDER_ON_PC/);
  });

  test('a folder outside every open project is refused with a reason', async () => {
    const res = await browse(path.join(tempRoot, 'state')).expect(403);
    expect(res.body.error).toMatch(/isn't in a project open on this board/);
  });

  test('container paths still work for windows rooted inside the checkout', async () => {
    const res = await browse(path.join(containerRoot, 'src')).expect(200);
    expect(res.body.children).toEqual([{ name: 'deep', isDir: true, path: path.join(containerRoot, 'src', 'deep') }]);
  });
});

describe('a typed folder Docker has no copy of', () => {
  beforeEach(() => setProject(HOST));
  linuxOnly('says it cannot be seen, not that it needs opening', async () => {
    const res = await browse('D:\\Archive').expect(404);
    expect(res.body.error).toMatch(/can't see D:\\Archive/);
  });
});

describe('a new censaiOS with no default project yet', () => {
  beforeEach(() => {
    fs.rmSync(path.join(stateDir, 'current-project.json'), { force: true });
    fs.writeFileSync(path.join(stateDir, 'open-projects.json'), JSON.stringify([HOST]));
  });
  const read = (p) => request(app).get('/api/files/content').query({ path: p });

  linuxOnly('a folder opened from Files lists its files, and they open', async () => {
    const res = await browse(HOST).expect(200);
    expect(res.body.children.map(c => c.name)).toEqual(['empty', 'src', 'README.md']);
    expect((await read(`${HOST}\\README.md`).expect(200)).body.content).toBe('hi');
  });

  linuxOnly('a Windows path outside the opened folders is outside, not a missing file in the app\'s own folder', async () => {
    const res = await read('D:\\Elsewhere\\made-up.md').expect(403);
    expect(res.body.reason).toBe('outside');
  });
});

describe("censaiOS's own folder of keys and logins, asked for with a Windows path", () => {
  beforeEach(() => setProject(HOST));
  linuxOnly('gets one plain answer, whether or not the folder is there', async () => {
    const { OWN_STATE_WORDS } = await import('../server/routes/files/ownState.js');
    fs.mkdirSync(path.join(containerRoot, '.homebase-state', 'made-up-there'), { recursive: true });
    const there = await browse(`${HOST}\\.homebase-state\\made-up-there`).expect(403);
    const notThere = await browse(`${HOST}\\.homebase-state\\made-up-not-there`).expect(403);
    expect(there.body.error).toBe(OWN_STATE_WORDS);
    expect(notThere.text).toBe(there.text);
  });
});
