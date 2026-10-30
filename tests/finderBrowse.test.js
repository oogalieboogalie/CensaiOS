import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The Finder lists a project's folder with when each entry changed and how big
// each file is (GET /api/files/browse?details=1). Its list must be the folder
// on disk: the same entries Files shows, the sizes and dates the files have.
// Pat Example owns this computer, Sam Example is a teammate. All files are made up.
const PEOPLE = { 1: { role: 'admin' }, 2: { role: 'user' } };
const PAT = 1;
const SAM = 2;
const pool = { query: jest.fn(async (_sql, [id]) => ({ rows: PEOPLE[id] ? [PEOPLE[id]] : [] })) };
jest.unstable_mockModule('../server/db.js', () => ({ default: pool }));

const tempRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'censai-finder-')));
const stateDir = path.join(tempRoot, 'state');
const project = path.join(tempRoot, 'made-up-garden');
const elsewhere = path.join(tempRoot, 'made-up-elsewhere');
const inProject = (...parts) => path.join(project, ...parts);
const DAY = 86_400_000;

function write(file, words, daysAgo) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, words);
  if (daysAgo !== undefined) {
    const when = new Date(Date.now() - daysAgo * DAY);
    fs.utimesSync(file, when, when);
  }
}
write(inProject('made-up-plan.md'), 'Made-up plan: paint the shed on Saturday.\n', 0);
write(inProject('made-up-tool.js'), `// Made-up tool\n${'// made-up line\n'.repeat(268)}`, 1);
write(inProject('Made-up Notes', 'made-up-list.md'), 'Made-up list: rope, lemons.\n', 30);
write(inProject('.made-up-hidden'), 'hidden');
write(inProject('node_modules', 'made-up-package', 'index.js'), 'module.exports = 1;\n');
write(path.join(elsewhere, 'made-up-big.txt'), 'x'.repeat(5000));
fs.symlinkSync(path.join(elsewhere, 'made-up-big.txt'), inProject('made-up-link.txt'));
write(path.join(stateDir, 'open-projects.json'), JSON.stringify([project]));
process.env.CENSAI_STATE_DIR = stateDir;

const { browserRouter } = await import('../server/routes/files/browser.js');

function app(userId) {
  const a = express();
  a.use((req, _res, next) => { req.session = { userId }; next(); });
  a.use('/api', browserRouter);
  return a;
}
const browse = (who, folder, details = true) => request(app(who)).get('/api/files/browse')
  .query({ path: folder, ...(details ? { details: '1' } : {}) });

/** What the Finder should list for a folder, read straight from the disk the way Files leaves things out. */
function onDisk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .map((e) => {
      const stats = fs.lstatSync(path.join(folder, e.name));
      const isDir = e.isDirectory();
      return { name: e.name, isDir, path: path.join(folder, e.name), modified: Math.round(stats.mtimeMs), ...(isDir ? {} : { size: stats.size }) };
    })
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
}

afterAll(() => {
  delete process.env.CENSAI_STATE_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("the Finder's list of a project folder", () => {
  test('is the folder on disk: folders first, each file with its size, each entry with when it changed', async () => {
    const res = await browse(PAT, project).expect(200);
    expect(res.body.children).toEqual(onDisk(project));
    expect(res.body.children.map((c) => c.name)).toEqual(['Made-up Notes', 'made-up-link.txt', 'made-up-plan.md', 'made-up-tool.js']);
    const tool = res.body.children.find((c) => c.name === 'made-up-tool.js');
    expect(tool.size).toBe(fs.statSync(inProject('made-up-tool.js')).size);
    expect(Date.now() - tool.modified).toBeGreaterThan(DAY - 60_000);
  });

  test('is the same for a teammate, and for a folder inside the project', async () => {
    expect((await browse(SAM, project).expect(200)).body.children).toEqual(onDisk(project));
    expect((await browse(SAM, inProject('Made-up Notes')).expect(200)).body.children).toEqual(onDisk(inProject('Made-up Notes')));
  });

  test("gives a link its own size and date, never those of the file it leads to outside the project", async () => {
    const link = (await browse(SAM, project).expect(200)).body.children.find((c) => c.name === 'made-up-link.txt');
    expect(link.size).toBe(fs.lstatSync(inProject('made-up-link.txt')).size);
    expect(link.size).not.toBe(5000);
  });

  test('leaves the answer other windows get as it was', async () => {
    const res = await browse(PAT, project, false).expect(200);
    for (const child of res.body.children) expect(Object.keys(child).sort()).toEqual(['isDir', 'name', 'path']);
  });

  test('says why a folder cannot be listed: one that is gone, one outside the open projects', async () => {
    const gone = await browse(PAT, inProject('made-up-gone')).expect(404);
    expect(gone.body.reason).toBe('missing');
    const outside = await browse(SAM, elsewhere).expect(403);
    expect(outside.body.reason).toBe('outside');
    expect(outside.text).not.toContain('made-up-big.txt');
  });

  test('gives a teammate only the name of a file that holds keys, as Files does; the owner gets its size and date', async () => {
    write(inProject('made-up-server.key'), 'not-a-real-made-up-key\n'.repeat(40), 3);
    try {
      const forSam = (await browse(SAM, project).expect(200)).body.children.find((c) => c.name === 'made-up-server.key');
      expect(forSam).toEqual({ name: 'made-up-server.key', isDir: false, path: inProject('made-up-server.key') });
      const forPat = (await browse(PAT, project).expect(200)).body.children;
      expect(forPat).toEqual(onDisk(project));
      expect(forPat.find((c) => c.name === 'made-up-server.key').size).toBe(fs.statSync(inProject('made-up-server.key')).size);
      // Everything else keeps its columns for the teammate.
      const samPlan = (await browse(SAM, project).expect(200)).body.children.find((c) => c.name === 'made-up-plan.md');
      expect(samPlan.size).toBe(fs.statSync(inProject('made-up-plan.md')).size);
    } finally {
      fs.rmSync(inProject('made-up-server.key'), { force: true });
    }
  });

  test("keeps a teammate out of a hidden folder, with the reason the owner's rule gives", async () => {
    write(inProject('.made-up-keys', 'made-up.pem'), 'made-up');
    const res = await browse(SAM, inProject('.made-up-keys')).expect(403);
    expect(res.body.reason).toBe('ownerOnly');
    expect(res.text).not.toContain('made-up.pem');
  });
});
