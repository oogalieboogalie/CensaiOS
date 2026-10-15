import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundledScript = path.join(repoRoot, 'scripts', 'jules-overnight.mjs');

// Merging pull requests is off unless the user turns it on in the window.
export function resolveOverseerRunner({ scriptPath, cwd, repo, autoMerge = false } = {}) {
  const target = scriptPath || bundledScript;
  const extension = path.extname(target).toLowerCase();
  const args = [target, '--repo', repo];
  const isNodeRunner = extension === '.js' || extension === '.mjs';
  if (autoMerge) args.push('--auto-merge');
  else if (isNodeRunner) args.push('--no-auto-merge');
  return {
    executable: isNodeRunner ? process.execPath : 'python',
    args,
    cwd: cwd || repoRoot,
    scriptPath: target,
  };
}
