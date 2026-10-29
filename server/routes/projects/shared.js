import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeProjectPathForStorage,
  resolveProjectPathForRuntime,
} from '../../workspaces/shared.js';
import { OWN_STATE_WORDS, isOwnState } from '../files/ownState.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CENSAI_STATE_DIR isolates local state (tests, sandboxes); same default as
// server/routes/files/pathUtils.js so both read the same files.
const STATE_DIR = process.env.CENSAI_STATE_DIR
  ? path.resolve(process.env.CENSAI_STATE_DIR)
  : path.resolve(path.join(__dirname, '..', '..', '..', '.homebase-state'));
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

function pathKey(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Every project open on the board: the board default first, then the other
 * open roots. Each window on a multi-project board names one of these.
 */
export async function listOpenProjectRoots() {
  const current = await readCurrentProject().catch(() => null);
  const open = await readOpenProjects().catch(() => []);
  const seen = new Set();
  const roots = [];
  for (const p of [current?.path, ...open]) {
    if (!p || seen.has(pathKey(p))) continue;
    seen.add(pathKey(p));
    const isDefault = Boolean(current?.path) && pathKey(p) === pathKey(current.path);
    roots.push({
      type: 'local',
      name: isDefault ? (current.name || inferProjectName(p)) : inferProjectName(p),
      path: p,
      projectId: isDefault ? current.projectId || null : null,
      isDefault,
    });
  }
  return roots;
}

/**
 * The project a request is about. A window tied to its own project sends
 * that project's path; without one the board default applies. Only projects
 * open on the board are accepted.
 */
export async function resolveRequestedProject(requestedPath) {
  const current = await readCurrentProject();
  if (!requestedPath || typeof requestedPath !== 'string') return current;
  if (current?.path && pathKey(current.path) === pathKey(requestedPath)) return current;
  const open = await readOpenProjects();
  const match = open.find((p) => pathKey(p) === pathKey(requestedPath));
  if (!match) {
    throw Object.assign(new Error('That folder is not open on this board. Pick it from the window project menu first.'), { statusCode: 403 });
  }
  return { type: 'local', name: inferProjectName(match), path: match };
}

export async function assertDirectory(projectPath) {
  const storedPath = normalizeProjectPathForStorage(projectPath);
  const runtimePath = resolveProjectPathForRuntime(storedPath);
  // censaiOS's own folder of keys and logins never becomes a project.
  if (await isOwnState(path.resolve(runtimePath))) throw new Error(OWN_STATE_WORDS);
  const stats = await fs.promises.stat(runtimePath);
  if (!stats.isDirectory()) throw new Error('Path is not a directory');
  return storedPath;
}
