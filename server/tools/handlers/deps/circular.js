import fs from 'fs';
import path from 'path';

async function collectJsFiles(dir, collected = []) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return collected;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await collectJsFiles(full, collected);
    } else if (/\.(js|mjs|cjs)$/.test(entry.name)) {
      collected.push(full);
    }
  }
  return collected;
}

function extractImports(source, fromFile) {
  const importedModules = new Set();
  const patterns = [
    /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const mod = match[1];
      if (mod.startsWith('.')) {
        const resolved = path.resolve(path.dirname(fromFile), mod);
        importedModules.add(resolved);
      }
    }
  }
  return [...importedModules];
}

export async function analyzeCircular(projectPath) {
  const searchDirs = [
    path.join(projectPath, 'src'),
    path.join(projectPath, 'server'),
  ];

  const allFiles = [];
  for (const dir of searchDirs) {
    await collectJsFiles(dir, allFiles);
  }

  if (allFiles.length === 0) {
    return 'No JS files found under src/ or server/ to analyze.';
  }

  const graph = new Map();
  for (const file of allFiles) {
    try {
      const source = await fs.promises.readFile(file, 'utf8');
      const imports = extractImports(source, file);
      const resolved = imports.map(imp => {
        if (graph.has(imp)) return imp;
        if (fs.existsSync(imp + '.js')) return imp + '.js';
        if (fs.existsSync(imp + '.mjs')) return imp + '.mjs';
        return imp;
      }).filter(imp => allFiles.includes(imp));
      graph.set(file, resolved);
    } catch {
      graph.set(file, []);
    }
  }

  const cycles = [];
  const visited = new Set();
  const recStack = new Set();

  function dfs(node, stackPath) {
    visited.add(node);
    recStack.add(node);
    stackPath.push(node);

    for (const neighbor of (graph.get(node) || [])) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, stackPath);
      } else if (recStack.has(neighbor)) {
        const cycleStart = stackPath.indexOf(neighbor);
        const cycle = stackPath.slice(cycleStart).map(f => path.relative(projectPath, f));
        cycles.push(cycle.join(' → '));
      }
    }

    stackPath.pop();
    recStack.delete(node);
  }

  for (const file of allFiles) {
    if (!visited.has(file)) {
      dfs(file, []);
    }
  }

  if (cycles.length === 0) return 'CIRCULAR DEPENDENCIES\nNo circular dependencies detected.';
  return `CIRCULAR DEPENDENCIES\nFound ${cycles.length} cycle(s):\n` + cycles.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
}
