import fs from 'fs';
import path from 'path';
import { ALWAYS_IGNORE, ENTRY_FILENAMES } from './shared.js';

export async function loadGitignore(root) {
  const patterns = new Set();
  try {
    const text = await fs.promises.readFile(path.join(root, '.gitignore'), 'utf8');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      patterns.add(line.replace(/^\/+|\/+$/g, ''));
    }
  } catch {}
  return patterns;
}

export function shouldSkipLocal(name, gitignore) {
  if (ALWAYS_IGNORE.has(name)) return true;
  if (name.startsWith('.') && name !== '.team' && name !== '.env.example' && name !== '.gitignore') return true;
  if (gitignore.has(name)) return true;
  return false;
}

export async function buildLocalTree(dir, gitignore, prefix = '', depth = 0, maxDepth = 2, maxEntries = 30) {
  if (depth > maxDepth) return '';
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return '';
  }
  entries = entries
    .filter(e => !shouldSkipLocal(e.name, gitignore))
    .sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1;
      const bDir = b.isDirectory() ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name);
    });

  let truncated = false;
  if (entries.length > maxEntries) {
    entries = entries.slice(0, maxEntries);
    truncated = true;
  }

  let out = '';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const last = i === entries.length - 1 && !truncated;
    const branch = last ? '└── ' : '├── ';
    const nextPrefix = prefix + (last ? '    ' : '│   ');
    out += `${prefix}${branch}${e.name}${e.isDirectory() ? '/' : ''}\n`;
    if (e.isDirectory()) {
      out += await buildLocalTree(path.join(dir, e.name), gitignore, nextPrefix, depth + 1, maxDepth, maxEntries);
    }
  }
  if (truncated) out += `${prefix}└── … (truncated)\n`;
  return out;
}

export async function detectLocalEntryPoints(root) {
  const found = [];
  try {
    const pkgRaw = await fs.promises.readFile(path.join(root, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw);
    if (pkg.main) found.push({ file: pkg.main, why: 'package.json `main`' });
    if (pkg.module) found.push({ file: pkg.module, why: 'package.json `module`' });
    if (pkg.scripts) {
      for (const s of ['dev', 'start', 'build', 'serve']) {
        if (pkg.scripts[s]) found.push({ file: `npm run ${s}`, why: `package.json script: ${pkg.scripts[s]}` });
      }
    }
  } catch {}
  const accessPromises = ENTRY_FILENAMES.map(async (name) => {
    try {
      await fs.promises.access(path.join(root, name));
      return name;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(accessPromises);
  for (const name of results) {
    if (name && !found.find(f => f.file === name)) {
      found.push({ file: name, why: 'common entry filename' });
    }
  }
  return found;
}
