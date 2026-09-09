import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeProjectPathForStorage,
  resolveProjectPathForRuntime,
} from '../../workspaces/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(path.join(__dirname, '..', '..', '..', '.homebase-state'));
export const CURRENT_PROJECT_FILE = path.join(STATE_DIR, 'current-project.json');
// Every project opened via PUT /api/current-project is registered here so the
// file browser can serve more than one project root at a time. The current
// project stays the global default (chat, terminal, new windows); this list
// only widens path validation.
export const OPEN_PROJECTS_FILE = path.join(STATE_DIR, 'open-projects.json');
const MAX_OPEN_PROJECTS = 20;
export const CORE_PROJECT_OWNERS = [
  'architect',
  'atlas',
  'genesis',
  'nexus',
  'foundation',
  'censai',
  'echo',
  'guardian',
];

export function inferProjectName(projectPath) {
  const parts = String(projectPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.at(-1) || 'workspace';
}

export function slugify(value) {
  return String(value || 'idea')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'idea';
}

export function formatIdeaDate(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export function escapeMd(value) {
  return String(value || '').replace(/\r/g, '').trim();
}

export async function findExistingHandoffBySourceId(handoffDir, sourceId) {
  if (!sourceId) return null;
  let entries = [];
  try {
    entries = await fs.promises.readdir(handoffDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filePath = path.join(handoffDir, entry.name);
    const body = await fs.promises.readFile(filePath, 'utf8');
    if (body.includes(`Source ID: ${sourceId}`)) return filePath;
  }
  return null;
}

export async function readCurrentProject() {
  try {
    const raw = await fs.promises.readFile(CURRENT_PROJECT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeCurrentProject(project) {
  await fs.promises.mkdir(STATE_DIR, { recursive: true });
  const tmpPath = `${CURRENT_PROJECT_FILE}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(project, null, 2), 'utf8');
  await fs.promises.rename(tmpPath, CURRENT_PROJECT_FILE);
}

export async function readOpenProjects() {
  try {
    const raw = await fs.promises.readFile(OPEN_PROJECTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function registerOpenProject(storedPath) {
  if (!storedPath || typeof storedPath !== 'string') return [];
  const normalized = storedPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const existing = await readOpenProjects();
  const next = [storedPath, ...existing.filter(p => p.replace(/\\/g, '/').replace(/\/+$/, '') !== normalized)]
    .slice(0, MAX_OPEN_PROJECTS);
  await fs.promises.mkdir(STATE_DIR, { recursive: true });
  const tmpPath = `${OPEN_PROJECTS_FILE}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  await fs.promises.rename(tmpPath, OPEN_PROJECTS_FILE);
  return next;
}

export async function assertDirectory(projectPath) {
  const storedPath = normalizeProjectPathForStorage(projectPath);
  const runtimePath = resolveProjectPathForRuntime(storedPath);
  const stats = await fs.promises.stat(runtimePath);
  if (!stats.isDirectory()) throw new Error('Path is not a directory');
  return storedPath;
}
