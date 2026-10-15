import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { readOpenProjects } from '../projects/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CENSAI_STATE_DIR isolates local-state reads (tests, sandboxes) from the
// checkout's live .homebase-state without changing default behavior.
export const LOCAL_STATE_DIR = process.env.CENSAI_STATE_DIR
  ? path.resolve(process.env.CENSAI_STATE_DIR)
  : path.resolve(path.join(__dirname, '..', '..', '..', '.homebase-state'));
const CURRENT_PROJECT_FILE = path.join(LOCAL_STATE_DIR, 'current-project.json');

export async function readCurrentProject() {
  try {
    const raw = await fs.promises.readFile(CURRENT_PROJECT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function validatePath(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(process.cwd());
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Access denied: Path is outside allowed directory');
  }
  return resolvedTarget;
}

export function resolveProjectTargetPath(targetPath, projectPath) {
  const runtimeBase = resolveProjectPathForRuntime(projectPath);
  const normalizedTarget = String(targetPath || '').replace(/\\/g, '/');
  const normalizedStoredBase = String(projectPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalizedTarget === normalizedStoredBase || normalizedTarget.startsWith(`${normalizedStoredBase}/`)) {
    const suffix = normalizedTarget.slice(normalizedStoredBase.length).replace(/^\/+/, '');
    return path.resolve(runtimeBase, ...suffix.split('/').filter(Boolean));
  }
  return path.resolve(targetPath);
}

export async function validateProjectPath(targetPath) {
  const currentProject = await readCurrentProject();
  if (!currentProject?.path) return validatePath(targetPath);
  const resolvedBase = resolveProjectPathForRuntime(currentProject.path);
  const resolvedTarget = resolveProjectTargetPath(targetPath, currentProject.path);
  if (resolvedTarget === resolvedBase || resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return resolvedTarget;
  }
  // Multi-project canvas: accept paths inside any previously opened project
  // root, so file trees rooted at other projects keep working after the
  // global default switches.
  const openProjects = await readOpenProjects();
  for (const openPath of openProjects) {
    const openBase = resolveProjectPathForRuntime(openPath);
    const openTarget = resolveProjectTargetPath(targetPath, openPath);
    if (openTarget === openBase || openTarget.startsWith(openBase + path.sep)) {
      return openTarget;
    }
  }
  throw new Error('Access denied: Path is outside the current project root');
}

/**
 * The open project root a path lives in (board default first), or null.
 * Backlinks use it so a note in one project never searches another.
 */
export async function projectRootContaining(targetPath) {
  const currentProject = await readCurrentProject();
  const openProjects = await readOpenProjects().catch(() => []);
  for (const stored of [currentProject?.path, ...openProjects]) {
    if (!stored) continue;
    const base = resolveProjectPathForRuntime(stored);
    const target = resolveProjectTargetPath(targetPath, stored);
    if (target === base || target.startsWith(base + path.sep)) return base;
  }
  return null;
}

export async function getDirectoryTree(dirPath) {
  const stats = await fs.promises.stat(dirPath);
  const name = path.basename(dirPath);
  if (!stats.isDirectory()) return { name, path: dirPath };

  const childrenNames = await fs.promises.readdir(dirPath);
  const children = [];
  for (const childName of childrenNames) {
    if (childName === 'node_modules' || childName === '.git' || childName === '.antigravityignore' || childName === 'dist') continue;
    const childPath = path.join(dirPath, childName);
    try {
      children.push(await getDirectoryTree(childPath));
    } catch {
      // skip unreadable entries
    }
  }
  children.sort((a, b) => {
    const aIsDir = !!a.children;
    const bIsDir = !!b.children;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.name.localeCompare(b.name);
  });
  return { name, path: dirPath, children };
}

const WINDOWS_PATH = /^[a-z]:[\\/]/i;

// Drop trailing slashes without a regex (a /[\\/]+$/ test is slow on long runs of slashes).
function trimTrailingSeparators(value) {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) end -= 1;
  return value.slice(0, end);
}

/**
 * File trees speak the path the window asked with. On a Windows PC running
 * censaiOS in Docker that is D:\Homebase\CensaiHub\src, not the container's
 * /workspace/CensaiHub/src, so the header, "Up" and new folders stay in
 * the user's own words. Other paths pass through as the server sees them.
 */
export function shownPathFor(requested, resolved, ...names) {
  if (requested && WINDOWS_PATH.test(requested) && process.platform !== 'win32') {
    const base = trimTrailingSeparators(String(requested)).replace(/\//g, '\\');
    return [base, ...names].join('\\');
  }
  return names.length ? path.join(resolved, ...names) : resolved;
}

export function shownParentFor(requested, resolved) {
  if (requested && WINDOWS_PATH.test(requested) && process.platform !== 'win32') {
    const parts = trimTrailingSeparators(String(requested)).split(/[\\/]/);
    if (parts.length <= 1) return null;
    return parts.length === 2 ? `${parts[0]}\\` : parts.slice(0, -1).join('\\');
  }
  const parent = path.dirname(resolved);
  return parent !== resolved ? parent : null;
}

/** A plain-words reason a folder could not be listed, or null. */
export function folderErrorMessage(err, requested) {
  if (isUnseenWindowsFolder(err, requested)) {
    return `censaiOS can't see ${requested} yet. It runs in Docker and only sees the folder it was started from and your projects folder. To share more, set CENSAI_PROJECTS_FOLDER_ON_PC to the folder that holds your projects (for example D:\\) in the .env file, then open censaiOS again.`;
  }
  if (err?.code === 'ENOENT') return `This folder doesn't exist: ${requested}`;
  if (err?.message?.startsWith('Access denied')) {
    return `${requested} isn't in a project open on this board. Type it in the path bar and press Enter to open it.`;
  }
  return null;
}

/** A Windows folder this (Docker) server has no copy of at all. */
export function isUnseenWindowsFolder(err, requested) {
  if (!requested || !WINDOWS_PATH.test(requested) || process.platform === 'win32') return false;
  if (err?.code === 'ENOENT') return true;
  return !!err?.message?.startsWith('Access denied') && !fs.existsSync(resolveProjectPathForRuntime(requested));
}
