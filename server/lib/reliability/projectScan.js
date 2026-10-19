import fs from 'node:fs';
import path from 'node:path';
import { scanFile } from './engine.js';

// "Run a scan" in the Reliability window scans the open project's own code.
// The walk never follows links (so it can't leave the project folder), skips
// build and package folders, and stops at MAX_FILES so a huge project still
// answers quickly.
export const MAX_FILES = 40;
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor', 'venv', '__pycache__', 'target', 'out']);

function isTestFile(name) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || /^test_.*\.py$/.test(name);
}

export function listCodeFiles(root, { limit = MAX_FILES } = {}) {
  const found = [];
  const queue = [''];
  while (queue.length && found.length < limit) {
    const rel = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= limit) break;
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(childRel);
      } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name)) && !isTestFile(entry.name)) {
        found.push(childRel);
      }
    }
  }
  return found;
}

export function hasAdjacentTestIn(fullPath) {
  const ext = path.extname(fullPath);
  if (ext === '.py') return fs.existsSync(path.join(path.dirname(fullPath), `test_${path.basename(fullPath)}`));
  const stem = fullPath.slice(0, -ext.length);
  return ['.test.js', '.test.jsx', '.test.ts', '.test.tsx', '.spec.js', '.spec.ts'].some((suffix) => fs.existsSync(stem + suffix));
}

// Scores every listed file; a file that can't be read is skipped, not fatal.
export function scanProjectFolder(root, config, { limit = MAX_FILES } = {}) {
  const files = listCodeFiles(root, { limit });
  const results = [];
  for (const rel of files) {
    const fullPath = path.join(root, ...rel.split('/'));
    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    const result = scanFile(rel, content, config, { hasTests: hasAdjacentTestIn(fullPath) });
    results.push({ filePath: rel, score: result.score, heuristics: result.heuristics });
  }
  return { results, capped: files.length >= limit };
}
