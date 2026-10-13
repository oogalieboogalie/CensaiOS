import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJulesQueue } from '../server/julesQueue.js';

describe('Jules repository queue', () => {
  test('presents pending, inflight, blocked, and dispatched entries', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'censai-jules-queue-'));
    const queuePath = path.join(dir, 'queue.json');
    await fs.writeFile(path.join(dir, 'next.md'), [
      '# Next task',
      'Status: open',
      'Project: CensaiHub',
      'Priority: P1',
      '## Work',
      'Build the next task.',
    ].join('\n'));
    await fs.writeFile(queuePath, JSON.stringify({
      repo: 'owner/repo',
      autoMerge: true,
      pending: [{ brief: 'next.md', priority: 'P1' }],
      inflight: [{ brief: 'active.md', session: 'sessions/1' }],
      blocked: [{ brief: 'blocked.md', code: 'needs_contract' }],
      dispatched: [{ brief: 'done.md', status: 'merged' }],
    }));

    const queue = await readJulesQueue(queuePath, { repoRoot: dir, handoffDir: dir });
    expect(queue.counts).toEqual({ pending: 1, inflight: 1, blocked: 1, dispatched: 1 });
    expect(queue.pending[0]).toEqual(expect.objectContaining({
      status: 'pending',
      brief: 'next.md',
    }));
    expect(queue.inflight[0]).toEqual(expect.objectContaining({
      status: 'inflight',
      session: 'sessions/1',
    }));
    expect(queue.autoMerge).toBe(true);

    await fs.rm(dir, { recursive: true, force: true });
  });
});
