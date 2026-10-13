import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundledScript = path.join(repoRoot, 'scripts', 'jules-overnight.mjs');

export function resolveOverseerRunner({ scriptPath, cwd, repo, autoMerge = true } = {}) {
  const target = scriptPath || bundledScript;
  const extension = path.extname(target).toLowerCase();
  const args = [target, '--repo', repo];
  if (autoMerge) args.push('--auto-merge');
  return {
    executable: extension === '.js' || extension === '.mjs' ? process.execPath : 'python',
    args,
    cwd: cwd || repoRoot,
    scriptPath: target,
  };
}
