// Folders a coding CLI may work in: the open projects and folders inside
// them. Shared by the Agent Console route and agents that ask a CLI for help.
// "Open" is one list for terminals and for agents' project tools: the folders
// picked in the top bar, and every project censaiOS knows that has a folder
// on this computer (the rows agents work in, server/tools/helpers.js). Only
// this computer's owner starts a terminal, and the owner's agents already
// reach each of those projects (server/workspaces/ownerProjects.js). The
// family's past is left out: nothing in it can be changed.

import fs from 'fs';
import path from 'path';
import { readOpenProjects, readCurrentProject } from '../routes/projects/shared.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';
import { isPastProject } from '../workspaces/familyPast.js';
import pool from '../db.js';
import { dbReady } from '../dbState.js';

/** Stored folders of the projects censaiOS knows; none while the database is down. */
async function knownProjectFolders(db = pool) {
  if (db === pool && !dbReady()) return [];
  try {
    const { rows } = await db.query("SELECT id, name, path, repo FROM projects WHERE path IS NOT NULL AND path <> '' ORDER BY updated_at DESC");
    return rows.filter((row) => !isPastProject(row)).map((row) => row.path);
  } catch {
    return [];
  }
}

const isFolder = (target) => {
  try { return fs.statSync(target).isDirectory(); } catch { return false; }
};

/** Folders an agent may work in: the open projects (and folders inside them). */
export async function allowedRoots({ db = pool } = {}) {
  const current = await readCurrentProject().catch(() => null);
  const open = await readOpenProjects().catch(() => []);
  const picked = [current?.path, ...open].filter(Boolean);
  const known = await knownProjectFolders(db);
  const seen = new Set();
  const roots = [];
  for (const p of [...picked, ...known]) {
    const runtime = path.resolve(resolveProjectPathForRuntime(p));
    if (seen.has(runtime)) continue;
    // A known project whose folder is on another computer is not a place to work here.
    if (!picked.includes(p) && !isFolder(runtime)) continue;
    seen.add(runtime);
    roots.push({ path: runtime, name: path.basename(runtime), current: p === current?.path, isGit: fs.existsSync(path.join(runtime, '.git')) });
  }
  return roots;
}

export async function assertAllowedFolder(folder) {
  const target = path.resolve(String(folder || ''));
  const roots = await allowedRoots();
  const ok = roots.some((r) => target === r.path || target.startsWith(r.path + path.sep));
  if (!ok) {
    throw Object.assign(new Error('Open that folder as a project first (project picker in the top bar), then pick it here.'), { statusCode: 403 });
  }
  return target;
}

/** The open project a folder is in (the innermost, when one is inside another), or null. */
export async function rootOf(folder) {
  const target = path.resolve(String(folder || ''));
  const roots = (await allowedRoots()).filter((r) => target === r.path || target.startsWith(r.path + path.sep));
  return roots.sort((a, b) => b.path.length - a.path.length)[0]?.path || null;
}
