// The run's temp folder: tests write under it, and the whole run cleans up in one go.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const teardown = createRequire(import.meta.url)('./tmpGlobalTeardown.cjs');

test('os.tmpdir() points into this run\'s own temp folder', () => {
  expect(process.env.HOMEBASE_JEST_TMP).toMatch(/homebase-jest-/);
  expect(os.tmpdir()).toBe(process.env.HOMEBASE_JEST_TMP);
});

test('teardown deletes the run folder and everything left in it, and nothing else', async () => {
  const outside = fs.mkdtempSync(path.join(process.env.HOMEBASE_JEST_TMP, 'not-a-run-'));
  const fake = fs.mkdtempSync(path.join(process.env.HOMEBASE_JEST_TMP, 'homebase-jest-'));
  fs.mkdirSync(path.join(fake, 'projgit-x', '.git'), { recursive: true });
  const saved = process.env.HOMEBASE_JEST_TMP;
  process.env.HOMEBASE_JEST_TMP = fake;
  try {
    await teardown();
  } finally {
    process.env.HOMEBASE_JEST_TMP = saved;
  }
  expect(fs.existsSync(fake)).toBe(false);
  expect(fs.existsSync(outside)).toBe(true);
});

test('a second run in the same process (watch mode) gets a fresh folder next to the first, not inside it', async () => {
  const setup = createRequire(import.meta.url)('./tmpGlobalSetup.cjs');
  const saved = { tmp: process.env.HOMEBASE_JEST_TMP, tmpdir: process.env.TMPDIR };
  const base = process.env.HOMEBASE_JEST_TMP_BASE;
  try {
    for (let run = 0; run < 2; run += 1) {
      await setup();
      const dir = process.env.HOMEBASE_JEST_TMP;
      expect(path.dirname(dir)).toBe(base);
      await teardown();
      expect(fs.existsSync(dir)).toBe(false);
      expect(process.env.TMPDIR).toBe(base);
    }
  } finally {
    process.env.HOMEBASE_JEST_TMP = saved.tmp;
    process.env.TMPDIR = saved.tmpdir;
  }
});
