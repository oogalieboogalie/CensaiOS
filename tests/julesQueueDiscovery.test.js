import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classifyHandoff, discoverHandoffTasks, reconcileDiscoveredTasks } from '../server/julesQueueDiscovery.js';

const stat = { mtime: new Date('2026-06-19T00:00:00.000Z') };
const repoRoot = 'C:\\Homebase\\CensaiHub';

function classify(name, text) {
  return classifyHandoff({
    filePath: `${repoRoot}\\.team\\handoffs\\${name}`,
    text,
    stat,
    repoRoot,
  });
}

describe('Jules handoff discovery', () => {
  test('discovers open handoffs and ignores shipped receipts and templates', () => {
    expect(classify('open.md', [
      '# Open task',
      'Status: open/unverified',
      'Project: CensaiHub',
      '## Work',
      'Fix the window.',
    ].join('\n'))).toEqual(expect.objectContaining({
      status: 'pending',
      dispatchable: true,
    }));
    expect(classify('done.md', '# Done\nStatus: shipped on master')).toBeNull();
    expect(classify('JULES_TASK_TEMPLATE.md', '# Template\n## Work\nExample')).toBeNull();
  });

  test('marks multi-slice plans for splitting instead of dispatching the whole file', () => {
    expect(classify('plan.md', [
      '# Master plan',
      'Status: pending',
      'Execute as sequential narrow slices.',
    ].join('\n'))).toEqual(expect.objectContaining({
      status: 'needs_split',
      dispatchable: false,
    }));
  });

  test('keeps tracked tasks out of the discovered pending lane', () => {
    const discovered = [
      { brief: 'a.md', status: 'pending' },
      { brief: 'b.md', status: 'pending' },
    ];
    expect(reconcileDiscoveredTasks({
      inflight: [{ brief: 'a.md' }],
      dispatched: [],
      blocked: [],
    }, discovered)).toEqual([{ brief: 'b.md', status: 'pending' }]);
  });

  test('collapses duplicate work briefs into one queue task', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'censai-handoff-discovery-'));
    const body = [
      '# Duplicate task',
      'Status: open',
      'Project: CensaiHub',
      '## Work',
      'Fix the same window lag.',
    ].join('\n');
    await Promise.all([
      fs.writeFile(path.join(dir, 'a.md'), body),
      fs.writeFile(path.join(dir, 'b.md'), body.replace('# Duplicate task', '# Duplicate task copy')),
    ]);

    const tasks = await discoverHandoffTasks({ repoRoot: dir, handoffDir: dir });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].duplicateBriefs).toEqual(['b.md']);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
