import fs from 'fs';
import path from 'path';
import { ProjectMembershipError } from './membershipInput.js';

// The family's past: a read-only copy of the owner's old agent folder
// (homebase-db), mounted into censaiOS at CENSAI_FAMILY_PAST_DIR. Agents
// read it as the project "Family past" through the usual project tools and
// project access rules. Nobody changes it: the folder is mounted read only,
// and any tool that would write there is refused here first, even for this
// computer's owner. New memory goes where it always has (remember and the
// rest) and points back with a link such as
//   past://homebase-db/FAMILY_CORE/MEMORIES/Atlas/notes.md
// which project_read, project_list and project_file_outline open.

export const PAST_PROJECT_ID = 'shared-family-past';
export const PAST_PROJECT_NAME = 'Family past';
const PAST_LINK = /^past:\/\//i;
const PAST_LINKS_IN_TEXT = /past:\/\/[^\s"'<>)\]]+/gi;

export const PAST_READ_ONLY = "The family's past is read only. Nothing in it can be changed. "
  + 'Write new memory with remember (or a file in another project) and point back with a past:// link.';

/** Where the past is mounted inside censaiOS. */
export function familyPastRoot() {
  return path.resolve(process.env.CENSAI_FAMILY_PAST_DIR || '/workspace/family-past');
}

export const isPastLink = (value) => PAST_LINK.test(String(value || '').trim());

/** The path inside the past that a past:// link names ('.' for the whole past); throws for a link out of it. */
export function pastLinkToPath(link) {
  const raw = String(link || '').trim().replace(PAST_LINK, '');
  let rel;
  try {
    rel = decodeURIComponent(raw);
  } catch {
    rel = raw;
  }
  rel = path.posix.normalize(`/${rel.replace(/\\/g, '/')}`).replace(/^\/+/, '');
  if (rel.split('/').includes('..')) throw new Error(`A past:// link stays inside the past: ${link}`);
  return rel || '.';
}

/** Whether a project is the past, by its id or by a folder inside the past. */
export function isPastProject(project) {
  if (!project) return false;
  if (project.id === PAST_PROJECT_ID) return true;
  if (!project.path || project.repo) return false;
  const rel = path.relative(familyPastRoot(), path.resolve(String(project.path)));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Throws the read-only refusal when `permission` asks to change the past. */
export function refusePastWork(project, permission) {
  if (permission === 'work' && isPastProject(project)) {
    throw new ProjectMembershipError(PAST_READ_ONLY, { code: 'PROJECT_ACCESS_DENIED', statusCode: 403, readOnly: true });
  }
}

/**
 * The past's project row, made the first time it is needed. Not openProject:
 * that writes a .team folder into the project, and the past is read only.
 * Its date is set long ago, so it is never the "most recent project" a call
 * that names no project lands in.
 */
export async function ensurePastProject(db, { exists = fs.existsSync } = {}) {
  const root = familyPastRoot();
  if (!exists(root)) {
    throw new ProjectMembershipError("The family's past is not on this computer.", { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
  }
  await db.query(
    `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary, created_at, updated_at)
     VALUES ($1, 'architect', $2, $3, NULL, $4, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')
     ON CONFLICT (id) DO UPDATE SET path = EXCLUDED.path
       WHERE projects.path IS DISTINCT FROM EXCLUDED.path`,
    [PAST_PROJECT_ID, PAST_PROJECT_NAME, root, "Read-only copy of the family's old homebase-db folder. Link to it with past://"]
  );
}

/** The past:// links in a piece of text whose file or folder is not in the past. */
export function missingPastLinks(text, { exists = fs.existsSync } = {}) {
  const links = String(text || '').match(PAST_LINKS_IN_TEXT) || [];
  const root = familyPastRoot();
  return [...new Set(links.map((link) => link.replace(/[.,;:!?]+$/, '')))].filter((link) => {
    try {
      return !exists(path.join(root, pastLinkToPath(link)));
    } catch {
      return true;
    }
  });
}
