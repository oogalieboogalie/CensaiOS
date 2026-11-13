import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireLocalFilesystem } from '../../middleware/runtimeMode.js';
import { isComputerOwner } from '../../security/systemAdmin.js';
import { logOwnerRefusal } from '../../security/ownerNames.js';
import { ownerOnlyKind } from '../../security/ownerOnlyFiles.js';
import { safeErrorCode } from '../../security/errorCode.js';
import { createLogger } from '../../logger.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { listOpenProjectRoots, inferProjectName } from '../projects/shared.js';
import { projectPlace } from './pathUtils.js';

// The "Mount to" folder picker. It only offers folders this server can
// actually reach: on a PC running censaiOS in Docker that is the checkout it
// was started from and the projects folder, never the rest of the D: drive
// (a terminal pointed at D:\Repos could not start). Folders only: no file
// names, no file contents. A teammate gets only the projects open on the
// board, the folders Files already shows them; this computer's other
// folders stay the owner's.
export const foldersRouter = express.Router();
const log = createLogger('files');

// What a teammate hears for any folder outside the projects open on the
// board, or hidden or linked out of one: the same whether or not it is there.
export const TEAMMATE_FOLDER_REFUSAL = "Only this computer's owner can look in that folder.";

// Windows system folders a shared drive (D:\) carries; nobody works in these.
const HIDDEN = new Set(['node_modules', '$recycle.bin', 'system volume information', 'config.msi', 'recovery', 'msdownld.tmp']);

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function inside(child, root) {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** True when the server runs inside Docker (folders are shared in, not all reachable). */
function inDocker(env) {
  return Boolean(env.CENSAI_PROJECTS_FOLDER || env.HOMEBASE_CONTAINER_PROJECT_ROOT) || fs.existsSync('/.dockerenv');
}

/**
 * The top-level places the picker starts from: { name, root (server path),
 * stored (the path the board keeps, e.g. D:\Projects on the PC), open (a
 * project open on the board) }.
 */
export async function folderPlaces(env = process.env) {
  const places = [];
  const add = (name, root, stored = root, open = false) => {
    if (!root || !isDir(root)) return;
    const resolved = path.resolve(root);
    if (places.some((p) => p.root === resolved)) return;
    places.push({ name, root: resolved, stored, open });
  };
  const open = await listOpenProjectRoots().catch(() => []);
  for (const project of open) {
    add(project.name || inferProjectName(project.path), resolveProjectPathForRuntime(project.path), project.path, true);
  }
  const projectsFolder = env.CENSAI_PROJECTS_FOLDER;
  const onPc = env.CENSAI_PROJECTS_FOLDER_ON_PC || '';
  // A whole shared drive (CENSAI_PROJECTS_FOLDER_ON_PC=D:/) reads as "D: drive".
  const drive = /^([a-z]):[\\/]*$/i.exec(onPc.trim());
  add(drive ? `${drive[1].toUpperCase()}: drive` : 'Projects folder', projectsFolder, onPc || projectsFolder);
  const appRoot = env.HOMEBASE_CONTAINER_PROJECT_ROOT || process.cwd();
  add('censaiOS folder', appRoot, env.HOMEBASE_HOST_PROJECT_ROOT || appRoot);
  if (!inDocker(env)) add('Home', os.homedir());
  return places;
}

/** The path the board stores for a server folder: in the person's own words when it maps back. */
export function storedPathFor(serverPath, place) {
  if (!place || place.stored === place.root) return serverPath;
  const rel = path.relative(place.root, serverPath);
  if (!rel) return place.stored;
  const sep = /^[a-z]:[\\/]/i.test(place.stored) ? '\\' : '/';
  const stored = [place.stored.replace(/[\\/]+$/, ''), ...rel.split(path.sep)].join(sep);
  // Only use it when it leads back to the same folder; otherwise keep the server path.
  return path.resolve(resolveProjectPathForRuntime(stored)) === serverPath ? stored : serverPath;
}

function placeFor(serverPath, places) {
  let best = null;
  for (const place of places) {
    if (inside(serverPath, place.root) && (!best || place.root.length > best.root.length)) best = place;
  }
  return best;
}

/**
 * Whether a teammate may look in `target` (asked as `requested`): inside a
 * project open on the board (`place`), and where Files would show them a
 * folder too (server/routes/files/browser.js), so never censaiOS's own state,
 * a hidden folder or a link out of the project, judged against that project
 * and against the one Files takes it to be in.
 */
async function teammateMayLook(requested, target, place) {
  const folder = { isFile: false };
  if (!place || await ownerOnlyKind({ target, base: place.root }, folder)) return false;
  const files = await projectPlace(requested).catch(() => null);
  return Boolean(files) && !(await ownerOnlyKind(files, folder));
}

/** The open projects a teammate may look in (one inside another's hidden folder is the owner's). */
async function teammatePlaces(all) {
  const open = all.filter((p) => p.open);
  const may = await Promise.all(open.map((p) => teammateMayLook(p.stored, p.root, p)));
  return open.filter((_, i) => may[i]);
}

foldersRouter.get('/files/folders', requireLocalFilesystem, async (req, res) => {
  // Once the account is known even a failed listing says which places it offers.
  let about = null;
  try {
    const owner = await isComputerOwner(req);
    const all = await folderPlaces();
    const places = owner ? all : await teammatePlaces(all);
    const shownPlaces = places.map((p) => ({ name: p.name, path: p.root, mountPath: p.stored }));
    about = owner ? { places: shownPlaces } : { places: shownPlaces, openProjectsOnly: true };
    const requested = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!requested) return res.json(about);

    const target = path.resolve(resolveProjectPathForRuntime(requested));
    const place = placeFor(target, places);
    if (!owner && !(await teammateMayLook(requested, target, place))) {
      logOwnerRefusal(`${req.method} ${req.baseUrl}${req.path}`, 403, Number(req.session?.userId) || null);
      return res.status(403).json({ error: TEAMMATE_FOLDER_REFUSAL, reason: 'owner-only', code: 'computer_owner_only', ...about });
    }
    if (!place) return res.status(403).json({ error: 'censaiOS can\'t reach that folder from here.', ...about });
    if (!isDir(target)) return res.status(404).json({ error: 'That folder doesn\'t exist anymore.', ...about });

    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !HIDDEN.has(e.name.toLowerCase()))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => {
        const full = path.join(target, name);
        return { name, path: full, mountPath: storedPathFor(full, place) };
      });
    res.json({
      ...about,
      path: target,
      mountPath: storedPathFor(target, place),
      name: target === place.root ? place.name : path.basename(target),
      parent: target === place.root ? null : path.dirname(target),
      folders,
    });
  } catch (err) {
    // The code only: the message can name a folder or say what the database said.
    log.warn('folder list failed', { code: safeErrorCode(err) });
    res.status(500).json({ error: 'censaiOS couldn\'t list that folder right now.', ...about });
  }
});
