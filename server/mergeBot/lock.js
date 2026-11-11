// Re-run Kraken's file lock. GitHub's free plan cannot make that check required,
// so a green badge is not enough: the merge bot runs the check itself.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function runKrakenLock(number, { token = '', repo = '', cwd = repoRoot, spawnImpl = spawn } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(process.execPath, ['scripts/kraken/check.mjs', 'pr', String(number)], {
        cwd,
        env: {
          ...process.env,
          // The dedicated merge-bot token, passed through for this one check.
          GITHUB_TOKEN: token,
          GH_TOKEN: token,
          GITHUB_REPOSITORY: repo,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      resolve({ ok: false });
      return;
    }
    const drain = () => {};
    child.stdout?.on('data', drain);
    child.stderr?.on('data', drain);
    child.on('error', () => resolve({ ok: false }));
    child.on('close', (code) => resolve({ ok: code === 0 }));
  });
}
