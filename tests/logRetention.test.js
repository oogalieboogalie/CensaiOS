import fs from 'fs';
import os from 'os';
import path from 'path';
import { cleanupLogs } from '../server/logRetention.js';

async function writeFile(filePath, bytes, mtime) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, 'x'.repeat(bytes));
  await fs.promises.utimes(filePath, mtime, mtime);
}

describe('log retention cleanup', () => {
  test('removes logs older than retention days', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'homebase-logs-'));
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const freshDate = new Date();
    const oldPath = path.join(dir, 'homebase-old.jsonl');
    const freshPath = path.join(dir, 'homebase-fresh.jsonl');
    await writeFile(oldPath, 10, oldDate);
    await writeFile(freshPath, 10, freshDate);

    const result = await cleanupLogs({ fileEnabled: true, dir, retentionDays: 7, maxBytes: 0 });

    expect(result.deleted).toBe(1);
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(freshPath)).toBe(true);
  });

  test('trims oldest logs until storage cap is satisfied', async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'homebase-logs-'));
    const base = Date.now();
    await writeFile(path.join(dir, 'homebase-1.jsonl'), 60, new Date(base - 3000));
    await writeFile(path.join(dir, 'homebase-2.jsonl'), 60, new Date(base - 2000));
    await writeFile(path.join(dir, 'homebase-3.jsonl'), 60, new Date(base - 1000));

    const result = await cleanupLogs({ fileEnabled: true, dir, retentionDays: 0, maxBytes: 120 });

    expect(result.deleted).toBe(1);
    expect(result.remainingBytes).toBeLessThanOrEqual(120);
    expect(fs.existsSync(path.join(dir, 'homebase-1.jsonl'))).toBe(false);
  });
});
