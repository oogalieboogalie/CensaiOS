// Repo scout, step two: the map of a whole repo. Every file the scout can
// read, what each defines, and the links between them (who imports whom).
// The first look reads everything; after that only files whose size or
// time changed are read again, so the map stays fresh for almost nothing.

import fs from 'node:fs';
import path from 'node:path';
import { fileLanguage, parseFile } from './parse.js';
import { isSecretFileName } from '../security/secretFiles.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache', '.turbo',
  'target', 'vendor', '__pycache__', '.venv', 'venv', '.homebase-state', '.claude', 'tmp',
]);
const MAX_FILES = 12000;
const MAX_BYTES = 400 * 1024;
const MIN_REFRESH_MS = 2000;
const MAX_MAPS = 6;
const JS_TRY = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

const maps = new Map();

async function listFiles(root) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop();
    let entries = [];
    try { entries = await fs.promises.readdir(path.join(root, dir), { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) stack.push(rel);
      } else if (entry.isFile() && fileLanguage(rel) && !isSecretFileName(entry.name) && !/\.min\.|lock\.json$|\.map$/.test(entry.name)) {
        out.push(rel);
      }
    }
  }
  return out.sort();
}

function resolveJs(files, from, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)).replace(/^\/+/, '');
  for (const ext of JS_TRY) {
    if (files.has(base + ext)) return base + ext;
  }
  const noExt = base.replace(/\.(?:m|c)?js$/, '');
  for (const ext of ['.ts', '.tsx', '.jsx']) if (files.has(noExt + ext)) return noExt + ext;
  return null;
}

function resolvePy(files, from, spec) {
  const dots = /^\.*/.exec(spec)[0].length;
  const rest = spec.slice(dots).replace(/\./g, '/');
  let base = rest;
  if (dots) {
    let dir = path.posix.dirname(from);
    for (let i = 1; i < dots; i += 1) dir = path.posix.dirname(dir);
    base = path.posix.join(dir === '.' ? '' : dir, rest);
  }
  for (const candidate of [`${base}.py`, `${base}/__init__.py`]) if (files.has(candidate)) return candidate;
  return null;
}

function resolveSpecifier(files, from, node, spec) {
  if (node.lang === 'py') return resolvePy(files, from, spec);
  if (node.lang === 'css') return resolveJs(files, from, spec.startsWith('.') ? spec : `./${spec}`);
  return resolveJs(files, from, spec);
}

function link(map) {
  const importedBy = new Map();
  for (const [rel, node] of map.files) {
    node.imports = [];
    node.packages = [];
    for (const spec of node.specifiers) {
      const target = resolveSpecifier(map.files, rel, node, spec);
      if (target && target !== rel) {
        node.imports.push(target);
        if (!importedBy.has(target)) importedBy.set(target, []);
        importedBy.get(target).push(rel);
      } else if (!target && !spec.startsWith('.')) {
        node.packages.push(spec);
      }
    }
  }
  map.importedBy = importedBy;
  map.links = [...map.files.values()].reduce((sum, node) => sum + node.imports.length, 0);
}

async function refresh(map) {
  const started = Date.now();
  const rels = await listFiles(map.root);
  const seen = new Set(rels);
  let read = 0;
  for (const rel of [...map.files.keys()]) if (!seen.has(rel)) map.files.delete(rel);
  for (const rel of rels) {
    let stat;
    try { stat = await fs.promises.stat(path.join(map.root, rel)); } catch { map.files.delete(rel); continue; }
    const old = map.files.get(rel);
    if (old && old.mtimeMs === stat.mtimeMs && old.size === stat.size) continue;
    if (stat.size > MAX_BYTES) { map.files.delete(rel); continue; }
    const content = await fs.promises.readFile(path.join(map.root, rel), 'utf8').catch(() => null);
    if (content === null || content.includes('\u0000')) continue;
    map.files.set(rel, { path: rel, mtimeMs: stat.mtimeMs, size: stat.size, ...parseFile(rel, content) });
    read += 1;
  }
  if (read || map.links === undefined || rels.length !== map.lastCount) link(map);
  map.lastCount = rels.length;
  map.refreshedAt = Date.now();
  map.lastRefresh = { filesRead: read, ms: Date.now() - started, firstLook: !map.builtAt };
  if (!map.builtAt) map.builtAt = map.refreshedAt;
  return map;
}

/**
 * The map for a folder on this computer, read fresh: files that changed since
 * the last look are read again, the rest are kept. `force` skips the short
 * pause that stops two calls in a row from walking the folder twice.
 */
export async function getRepoMap(root, { force = false } = {}) {
  const abs = path.resolve(root);
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat?.isDirectory()) {
    throw Object.assign(new Error(`The scout cannot find the folder ${root} on this computer.`), { statusCode: 404 });
  }
  let map = maps.get(abs);
  if (!map) {
    map = { root: abs, files: new Map(), importedBy: new Map() };
    maps.set(abs, map);
    while (maps.size > MAX_MAPS) maps.delete(maps.keys().next().value);
  }
  if (!map.pending && (force || !map.refreshedAt || Date.now() - map.refreshedAt >= MIN_REFRESH_MS)) {
    map.pending = refresh(map).finally(() => { map.pending = null; });
  }
  if (map.pending) await map.pending;
  return map;
}

export function forgetRepoMaps() {
  maps.clear();
}

export function mapStats(map) {
  const symbols = [...map.files.values()].reduce((sum, node) => sum + node.symbols.length, 0);
  return {
    files: map.files.size,
    symbols,
    links: map.links || 0,
    refreshedAt: map.refreshedAt ? new Date(map.refreshedAt).toISOString() : null,
    lastRefresh: map.lastRefresh || null,
  };
}
