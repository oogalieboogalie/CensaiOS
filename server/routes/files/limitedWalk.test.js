import fs from 'fs';
import os from 'os';
import path from 'path';
import { walkFiles } from './limitedWalk.js';

let root;
const write = (rel, text = '') => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-walk-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('stops at the limit and says so, instead of walking the rest of a huge folder', async () => {
  for (let i = 0; i < 30; i += 1) write(`notes/day-${i}.md`);
  let looked = 0;
  const { results, capped } = await walkFiles(root, () => { looked += 1; return true; }, { limit: 10 });
  expect(results).toHaveLength(10);
  expect(capped).toBe(true);
  expect(looked).toBe(10);
});

test('under the limit, finds everything and is not capped', async () => {
  write('a/pat-plan.md'); write('b/c/pat-notes.md'); write('b/other.txt');
  const { results, capped } = await walkFiles(root, (e) => e.name.startsWith('pat'));
  expect(results.map((r) => r.relativePath.split(path.sep).join('/')).sort()).toEqual(['a/pat-plan.md', 'b/c/pat-notes.md']);
  expect(capped).toBe(false);
});

test('skips hidden folders and node_modules', async () => {
  write('.git/pat.md'); write('node_modules/x/pat.md'); write('pat.md');
  const { results } = await walkFiles(root, () => true);
  expect(results.map((r) => r.name)).toEqual(['pat.md']);
  expect(results[0].isDir).toBe(false);
});

test('a missing folder still fails, so the window can say why', async () => {
  await expect(walkFiles(path.join(root, 'gone'), () => true)).rejects.toThrow();
});
