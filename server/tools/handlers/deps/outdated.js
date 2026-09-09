import { runnerClient } from '../../../runner/client.js';

export async function analyzeOutdated(projectPath) {
  try {
    const { stdout } = await runnerClient.exec('npm', ['outdated', '--json'], {
      cwd: projectPath,
    });

    if (!stdout || stdout.trim() === '{}' || stdout.trim() === '') {
      return 'OUTDATED PACKAGES\nAll packages are up to date.';
    }

    let data;
    try {
      data = JSON.parse(stdout);
    } catch {
      return `OUTDATED PACKAGES\nCould not parse npm outdated output:\n${stdout}`;
    }

    const entries = Object.entries(data);
    if (entries.length === 0) return 'OUTDATED PACKAGES\nAll packages are up to date.';

    const header = 'PACKAGE'.padEnd(35) + 'CURRENT'.padEnd(15) + 'LATEST'.padEnd(15) + 'TYPE';
    const divider = '-'.repeat(75);
    const rows = entries.map(([pkg, info]) =>
      pkg.padEnd(35) +
      (info.current || 'n/a').padEnd(15) +
      (info.latest || 'n/a').padEnd(15) +
      (info.type || '')
    ).join('\n');

    return `OUTDATED PACKAGES\n${header}\n${divider}\n${rows}`;
  } catch (err) {
    if (err.code === 'ENOENT') return 'OUTDATED PACKAGES\nnpm not found on this system.';
    return `OUTDATED PACKAGES\nError running npm outdated: ${err.message}`;
  }
}
