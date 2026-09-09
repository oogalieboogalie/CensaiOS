import { tryGetFile as ghTryGetFile } from '../github.js';
import { ENTRY_FILENAMES } from './shared.js';

export async function detectGithubEntryPoints(repo, entries) {
  const found = [];
  const topLevel = new Set(entries.filter(e => !e.path.includes('/')).map(e => e.path));

  if (topLevel.has('package.json')) {
    const pkgRaw = await ghTryGetFile(repo, 'package.json');
    if (pkgRaw) {
      try {
        const pkg = JSON.parse(pkgRaw);
        if (pkg.main) found.push({ file: pkg.main, why: 'package.json `main`' });
        if (pkg.module) found.push({ file: pkg.module, why: 'package.json `module`' });
        if (pkg.scripts) {
          for (const s of ['dev', 'start', 'build', 'serve']) {
            if (pkg.scripts[s]) found.push({ file: `npm run ${s}`, why: `package.json script: ${pkg.scripts[s]}` });
          }
        }
      } catch {}
    }
  }
  for (const name of ENTRY_FILENAMES) {
    if (topLevel.has(name) && !found.find(f => f.file === name)) {
      found.push({ file: name, why: 'common entry filename' });
    }
  }
  return found;
}
