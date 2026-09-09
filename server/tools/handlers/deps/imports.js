import path from 'path';
import { readJsonFile } from './shared.js';

async function getInstalledVersion(projectPath, pkgName) {
  try {
    const pkgJsonPath = path.join(projectPath, 'node_modules', pkgName, 'package.json');
    const json = await readJsonFile(pkgJsonPath);
    return json.version || '?';
  } catch {
    return '(not installed)';
  }
}

export async function analyzeImports(projectPath) {
  let pkgJson;
  try {
    pkgJson = await readJsonFile(path.join(projectPath, 'package.json'));
  } catch {
    return 'Could not read package.json.';
  }

  const deps = pkgJson.dependencies || {};
  const devDeps = pkgJson.devDependencies || {};
  const all = [
    ...Object.entries(deps).map(([k, v]) => ({ name: k, declared: v, type: 'dep' })),
    ...Object.entries(devDeps).map(([k, v]) => ({ name: k, declared: v, type: 'dev' })),
  ];

  if (all.length === 0) return 'No dependencies declared in package.json.';

  const rows = await Promise.all(all.map(async entry => {
    const installed = await getInstalledVersion(projectPath, entry.name);
    return {
      name: entry.name,
      declared: entry.declared,
      installed,
      type: entry.type,
    };
  }));

  const header = 'PACKAGE'.padEnd(35) + 'DECLARED'.padEnd(20) + 'INSTALLED'.padEnd(20) + 'TYPE';
  const divider = '-'.repeat(85);
  const lines = rows.map(r =>
    r.name.padEnd(35) + r.declared.padEnd(20) + r.installed.padEnd(20) + r.type
  ).join('\n');

  return `DEPENDENCY LIST\n${header}\n${divider}\n${lines}`;
}
