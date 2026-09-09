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
