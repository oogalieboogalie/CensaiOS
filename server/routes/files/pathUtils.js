import fs from 'fs';
import path from 'path';
import { mapProjectPathForRuntime, normalizeProjectPathForStorage, resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { readOpenProjects } from '../projects/shared.js';
import { FILE_PROBLEMS, SAVE_PROBLEMS } from '../../../shared/files/fileProblems.js';
import { OWNER_ONLY_FILE } from '../../security/secretFiles.js';
import { LOCAL_STATE_DIR, OWN_STATE, OWN_STATE_WORDS, refuseOwnState } from './ownState.js';

export { LOCAL_STATE_DIR, OWN_STATE };
const CURRENT_PROJECT_FILE = path.join(LOCAL_STATE_DIR, 'current-project.json');

export async function readCurrentProject() {
  try {
    const raw = await fs.promises.readFile(CURRENT_PROJECT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

/** `targetPath` as this server sees it inside the project at `root`, with that project's folder, or null when it is outside it. */
function insideProject(targetPath, root) {
  const base = resolveProjectPathForRuntime(root);
  const target = resolveProjectTargetPath(targetPath, root);
  return target === base || target.startsWith(base + path.sep) ? { target, base } : null;
}

/** Where `targetPath` is on this server, when it may open on the board; throws "Access denied" otherwise. */
export async function validateProjectPath(targetPath) {
  return (await projectPlace(targetPath)).target;
}

/** As validateProjectPath, with the folder of the project (or the app's own folder) it is in: { target, base }. */
export async function projectPlace(targetPath) {
  const place = await allowedPlace(targetPath);
  return { target: await refuseOwnState(place.target), base: place.base };
}

async function allowedPlace(targetPath) {
  const currentProject = await readCurrentProject();
  const inCurrent = currentProject?.path && insideProject(targetPath, currentProject.path);
  if (inCurrent) return inCurrent;
  // Multi-project canvas: accept paths inside any previously opened project
  // root, so file trees rooted at other projects keep working after the
  // global default switches, and a folder opened from Files works before any
  // project is the default.
  for (const openPath of await readOpenProjects().catch(() => [])) {
    const inOpen = insideProject(targetPath, openPath);
    if (inOpen) return inOpen;
  }
  if (currentProject?.path) throw new Error('Access denied: Path is outside the current project root');
  // With no default project yet, the app's own folder is allowed too. On a
  // server in Docker a Windows path (D:\Notes) reads as a folder inside it,
  // so one is never taken for it.
  const appFolder = path.resolve(process.cwd());
  const target = path.resolve(targetPath);
  const windowsPathHere = WINDOWS_PATH.test(String(targetPath)) && process.platform !== 'win32';
  if (!windowsPathHere && (target === appFolder || target.startsWith(appFolder + path.sep))) return { target, base: appFolder };
  throw new Error('Access denied: Path is outside allowed directory');
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

const WINDOWS_PATH = /^[a-z]:[\\/]/i;

// Drop trailing slashes without a regex (a /[\\/]+$/ test is slow on long runs of slashes).
function trimTrailingSeparators(value) {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) end -= 1;
  return value.slice(0, end);
}

/**
 * File trees speak the path the window asked with. On a Windows PC running
 * censaiOS in Docker that is D:\Repos\CensaiHub\src, not the container's
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
  if (err?.code === OWN_STATE) return OWN_STATE_WORDS;
  if (err?.code === OWNER_ONLY_FILE) return "Only this computer's owner can open this folder.";
  if (err?.message?.startsWith('Access denied')) {
    return `${requested} isn't in a project open on this board. Type it in the path bar and press Enter to open it.`;
  }
  return null;
}

const READ_PROBLEMS = {
  ENOENT: [404, 'missing'],
  ENOTDIR: [404, 'missing'],
  EISDIR: [400, 'folder'],
  EACCES: [403, 'denied'],
  EPERM: [403, 'denied'],
  [OWN_STATE]: [403, 'secret'],
  [OWNER_ONLY_FILE]: [403, 'ownerOnly'],
};

/**
 * Why a file could not be read, as { status, reason, error } with the plain
 * words from shared/files/fileProblems.js; never the error's own text, which
 * names the server's folders.
 */
export function fileReadProblem(err) {
  const [status, reason] = (Object.hasOwn(READ_PROBLEMS, err?.code) && READ_PROBLEMS[err.code])
    || (err?.message?.startsWith('Access denied') ? [403, 'outside'] : [500, 'unreadable']);
  return { status, reason, error: FILE_PROBLEMS[reason] };
}

const WRITE_PROBLEMS = {
  ENOENT: [404, 'gone'],
  ENOTDIR: [404, 'gone'],
  EISDIR: [400, 'folder'],
  EEXIST: [409, 'exists'],
  EACCES: [403, 'denied'],
  EPERM: [403, 'denied'],
  EROFS: [403, 'denied'],
  EBUSY: [409, 'busy'],
  ETXTBSY: [409, 'busy'],
  ENOSPC: [507, 'full'],
  EDQUOT: [507, 'full'],
  [OWN_STATE]: [403, 'secret'],
};

/**
 * Why a file could not be saved, as { status, reason, error } with the plain
 * words from shared/files/fileProblems.js; never the error's own text, which
 * names the server's folders.
 */
export function fileWriteProblem(err) {
  const [status, reason] = (Object.hasOwn(WRITE_PROBLEMS, err?.code) && WRITE_PROBLEMS[err.code])
    || (err?.message?.startsWith('Access denied') ? [403, 'outside'] : [500, 'unsaved']);
  // A full disk met while writing in place (saveWhole.js) may have cut the file short.
  const said = reason === 'full' && err.cutShort === true ? 'fullCutShort' : reason;
  return { status, reason: said, error: SAVE_PROBLEMS[said] };
}

/** A Windows folder this (Docker) server has no copy of at all. */
export function isUnseenWindowsFolder(err, requested) {
  // censaiOS's own state folder, and what only the owner opens, get one answer whether or not the path is there.
  if (err?.code === OWN_STATE || err?.code === OWNER_ONLY_FILE) return false;
  if (!requested || !WINDOWS_PATH.test(requested) || process.platform === 'win32') return false;
  // Inside a folder shared into Docker (the projects folder, the checkout), a
  // missing folder is just gone.
  if (err?.code === 'ENOENT') return WINDOWS_PATH.test(mapProjectPathForRuntime(normalizeProjectPathForStorage(requested)));
  return !!err?.message?.startsWith('Access denied') && !fs.existsSync(resolveProjectPathForRuntime(requested));
}
