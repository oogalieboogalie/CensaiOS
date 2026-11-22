// What makes two projects the same project, and how a new one gets its id.
//
// A project is where its files live: the full owner/repo for one kept on
// GitHub, the folder for one on this computer. Two projects with the same name
// from different places are different projects.
//
// The id scheme:
//   1. A row that already exists keeps the id it has, for ever. Boards, tasks,
//      schedules and Kraken requests hold that id.
//   2. The first project with a name gets the short id, shared-<name>, as every
//      install made it before.
//   3. A later project with the same name from a different place gets
//      shared-<name>-<8 hex>, where the hex is the start of the SHA-256 of its
//      place ("github:acme/shop" or "folder:d:/repos/shop"). The same place
//      always gives the same id, so opening it twice at once still makes one row.
//
// No database and no Node file access here, so the lookups can load it alone.

import crypto from 'node:crypto';
import { ProjectMembershipError } from './membershipInput.js';
import { safeName } from './shared.js';

const CHOICES_SHOWN = 6;

/** A GitHub repo as one spelling: GitHub reads Acme/Shop and acme/shop as the same repo. */
export function repoSourceKey(repo) {
  const clean = String(repo || '').trim().replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').toLowerCase();
  return clean ? `github:${clean}` : '';
}

/** A folder as one spelling. D:\Repos\Shop and d:/repos/shop are one folder; /srv/Shop and /srv/shop are two. */
export function folderSourceKey(folder) {
  const clean = String(folder || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean) return '';
  return `folder:${/^[a-z]:/i.test(clean) ? clean.toLowerCase() : clean}`;
}

/** Where a project row's files live. A row on GitHub that also has a folder is the GitHub project. */
export function projectSourceKey(project) {
  return repoSourceKey(project?.repo) || folderSourceKey(project?.path) || `row:${project?.id || ''}`;
}

/** The short id: the one the first project with this name gets. */
export function plainProjectId(name) {
  return `shared-${safeName(String(name || ''))}`;
}

/** The id for a project whose name is already taken by a project from somewhere else. */
export function distinctProjectId(name, sourceKey) {
  const hash = crypto.createHash('sha256').update(String(sourceKey)).digest('hex').slice(0, 8);
  return `${plainProjectId(name)}-${hash}`;
}

/** Each different project in `rows` once, keeping the first row of each (rows come best first). */
export function distinctProjects(rows) {
  const seen = new Set();
  return (rows || []).filter((row) => {
    const key = projectSourceKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function describe(project) {
  const where = project.repo || project.path || 'no repo or folder';
  return `"${String(project.name || project.id).slice(0, 80)}" (${String(where).slice(0, 200)}, id ${project.id})`;
}

/** The plain-words answer when a name fits more than one project. */
export function projectChoiceError(asked, projects) {
  const shown = projects.slice(0, CHOICES_SHOWN).map(describe);
  if (projects.length > CHOICES_SHOWN) shown.push('more');
  const error = new ProjectMembershipError(
    `More than one project is called "${String(asked).slice(0, 80)}": ${shown.join(', ')}. `
      + 'Call again with project set to the one you mean: its repo (owner/name), its folder or its id.',
    { code: 'PROJECT_NAME_NEEDED', statusCode: 400 }
  );
  error.choices = projects.slice(0, CHOICES_SHOWN).map((p) => ({ id: p.id, name: p.name, repo: p.repo || null, path: p.path || null }));
  return error;
}

/**
 * The one project a loose match (a bare name, a repo's or folder's last part)
 * means: the row when every match is the same project, null when there is
 * none, and a refusal that names the choices when they are different projects.
 */
export function oneProjectOrChoice(rows, asked) {
  const projects = distinctProjects(rows);
  if (projects.length > 1) throw projectChoiceError(asked, projects);
  return projects[0] || null;
}

/**
 * The project that `asked` means among `rows` (best first). Its id, its full repo
 * or its folder wins outright; only a loose match (a name, a last part) to
 * different projects is a choice.
 */
export function pickProjectFor(rows, asked) {
  if (!rows?.length) return null;
  const text = String(asked ?? '').trim();
  const repo = repoSourceKey(text);
  const folder = folderSourceKey(text);
  const exact = rows.find((row) => row.id === text)
    || rows.find((row) => (row.repo && repoSourceKey(row.repo) === repo) || (row.path && folderSourceKey(row.path) === folder));
  return exact || oneProjectOrChoice(rows, text);
}
