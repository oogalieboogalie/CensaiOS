import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listCodeFiles, scanProjectFolder } from './projectScan.js';

const config = { thresholds: { overall: 80, monolith_lines: 250, nesting_depth: 4 }, weights: { monolith: 20, complexity: 30, security: 40, tests: 10 } };
let root;

function write(rel, text = 'export const x = 1;\n') {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'reliability-project-'));
  write('src/app.js');
  write('src/app.test.js');
  write('src/tools.py', 'def run():\n    return 1\n');
  write('node_modules/pkg/index.js');
  write('.git/hooks/x.js');
  write('README.md', '# Jordan\'s project\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('lists code files only, skipping packages, hidden folders and tests', () => {
  expect(listCodeFiles(root)).toEqual(['src/app.js', 'src/tools.py']);
});

test('never follows a link out of the project', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'reliability-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.js'), 'export const s = 1;\n');
  fs.symlinkSync(outside, path.join(root, 'linked'));
  expect(listCodeFiles(root)).not.toContain('linked/secret.js');
  fs.rmSync(outside, { recursive: true, force: true });
});

test('stops at the file limit', () => {
  for (let i = 0; i < 5; i += 1) write(`lib/f${i}.js`);
  expect(listCodeFiles(root, { limit: 3 })).toHaveLength(3);
  expect(scanProjectFolder(root, config, { limit: 3 }).capped).toBe(true);
});

test('scores each file and notices the matching test file', () => {
  const { results, capped } = scanProjectFolder(root, config);
  expect(capped).toBe(false);
  const app = results.find((r) => r.filePath === 'src/app.js');
  expect(app.heuristics.has_tests).toBe(true);
  expect(typeof app.score).toBe('number');
  expect(results.find((r) => r.filePath === 'src/tools.py').heuristics.has_tests).toBe(false);
});
