import { resolveDepsProjectPath } from './shared.js';
import { analyzeImports } from './imports.js';
import { analyzeCircular } from './circular.js';
import { analyzeOutdated } from './outdated.js';

export async function handleAnalyzeDeps(agentId, args) {
  const projectPath = await resolveDepsProjectPath(agentId, args);
  const mode = args.mode || 'all';

  if (mode === 'imports') {
    return analyzeImports(projectPath);
  }
  if (mode === 'circular') {
    return analyzeCircular(projectPath);
  }
  if (mode === 'outdated') {
    return analyzeOutdated(projectPath);
  }
  if (mode === 'all') {
    const [imp, circ, out] = await Promise.all([
      analyzeImports(projectPath),
      analyzeCircular(projectPath),
      analyzeOutdated(projectPath),
    ]);
    return [
      '═══ IMPORTS ═══════════════════════════════════════════\n' + imp,
      '\n═══ CIRCULAR DEPENDENCIES ═════════════════════════════\n' + circ,
      '\n═══ OUTDATED PACKAGES ══════════════════════════════════\n' + out,
    ].join('\n');
  }

  return `Unknown analyze_deps mode "${mode}". Valid: imports, circular, outdated, all.`;
}
