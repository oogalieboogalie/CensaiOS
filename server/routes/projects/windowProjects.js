import pool from '../../db.js';
import { boardMayUse, folderKey } from './newProjectOwnerOnly.js';

const MAX_WINDOW_PROJECTS = 32;

function folderOf(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    return folderKey(value);
  } catch {
    return ''; // quiet: a folder name that cannot be read names no project
  }
}

/**
 * The projects a board's windows are set to, as the board sends them on each
 * save ({ projectId?, path, memberships }), made ready to give: each found by
 * its id or, when the window only knows the folder, by that folder. A
 * window's project is part of the shared board, which every teammate on it
 * edits, so the owner's own save can carry a teammate's pick. So a window
 * only ever hands out a project anyone on the board may hand out: one the
 * board already has, or one this computer's owner has open here. Never one
 * that is new, whoever's save it is; the owner opens a new project from the
 * project menu first. One that is not found or not allowed is left out
 * (`skipped`), and the rest of the board still saves.
 */
export async function windowProjectsToGive({ workspaceId, projectId, windowProjects, db = pool } = {}) {
  if (!Array.isArray(windowProjects) || windowProjects.length === 0) return { windowProjects: [], skipped: 0 };
  const entries = windowProjects.slice(0, MAX_WINDOW_PROJECTS);
  let skipped = windowProjects.length - entries.length;

  let byFolder = null;
  const folderProjects = async () => {
    if (byFolder) return byFolder;
    const { rows } = await db.query('SELECT id, path FROM projects WHERE path IS NOT NULL ORDER BY updated_at DESC');
    byFolder = new Map();
    for (const row of rows) {
      const folder = folderOf(row.path);
      if (folder && !byFolder.has(folder)) byFolder.set(folder, row.id);
    }
    return byFolder;
  };

  const given = [];
  for (const entry of entries) {
    const memberships = Array.isArray(entry?.memberships) ? entry.memberships : [];
    if (memberships.length === 0) continue;
    let id = typeof entry?.projectId === 'string' ? entry.projectId.trim() : '';
    if (!id) id = (await folderProjects()).get(folderOf(entry?.path)) || '';
    if (!id) { skipped += 1; continue; }
    if (id === projectId) continue;
    if (!(await boardMayUse(db, workspaceId, id))) { skipped += 1; continue; }
    given.push({ projectId: id, memberships });
  }
  return { windowProjects: given, skipped };
}
