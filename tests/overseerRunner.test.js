import path from 'node:path';
import { resolveOverseerRunner } from '../server/overseer/runner.js';

describe('Overseer runner', () => {
  test('uses the bundled Node Jules runner by default', () => {
    const runner = resolveOverseerRunner({ repo: 'owner/repo' });
    expect(runner.executable).toBe(process.execPath);
    expect(path.basename(runner.scriptPath)).toBe('jules-overnight.mjs');
    expect(runner.args).toEqual(expect.arrayContaining(['--repo', 'owner/repo', '--auto-merge']));
  });

  test('keeps legacy Python script overrides working', () => {
    const runner = resolveOverseerRunner({
      scriptPath: 'C:\\tools\\overseer.py',
      cwd: 'C:\\tools',
      repo: 'owner/repo',
    });
    expect(runner.executable).toBe('python');
    expect(runner.cwd).toBe('C:\\tools');
  });
});
