import fs from 'fs';
import path from 'path';
import pool from '../db.js';
import { getRepoInfo } from '../github.js';
import {
  safeName,
  getSharedWorkspaceDir,
  isGithubProject,
  normalizeProjectPathForStorage,
  resolveProjectPathForRuntime,
} from './shared.js';
import { refreshProjectBrief } from './briefs.js';
import { logProjectActivity } from './activity.js';
import { distinctProjectId, folderSourceKey, plainProjectId, repoSourceKey } from './projectIdentity.js';
import { findExistingGithubProject, findExistingLocalProject, getProjectByName, sameFolder } from './projectFind.js';

export { findExistingGithubProject, findExistingLocalProject, getProjectByName, getProjectByRepoOrPath } from './projectFind.js';

// How a project gets its id, and what makes two projects the same one, is in
// ./projectIdentity.js: a project is its full owner/repo or its folder, never
// just its name.

/** The short id, shared-<name>: what the first project with a name gets. */
export function sharedProjectIdFor(name) {
  return plainProjectId(name);
}

// Saved under the row's own id when it is already here; a new project tries
// the short id, then the one that carries its place. The database changes a
// row only when it is this same project (or points nowhere yet), so a project
// from somewhere else that holds the id is left exactly as it was.
async function saveProject({ existing, name, sourceKey, insert, findAgain }) {
  const ids = existing ? [existing.id] : [plainProjectId(name), distinctProjectId(name, sourceKey)];
  for (const id of ids) {
    try {
      const { rows } = await insert(id);
      if (rows[0]) {
        const { is_new: isNew, ...project } = rows[0];
        return { project, created: !existing && isNew !== false };
      }
    } catch (error) {
      if (error?.code !== '23505') throw error;
      // The database already has this very repo under another id (opened at the same moment).
      const row = await findAgain();
      if (row) return { project: row, created: false };
      // Before docker/098-project-identity.sql has run, one agent cannot hold two projects with one name.
      throw new Error(`A project called "${name}" is already open here from somewhere else, and this copy of censaiOS has not finished updating to keep both. Restart censaiOS, then open it again.`, { cause: error });
    }
  }
  throw new Error(`"${name}" could not be opened: the ids for it are held by other projects. Open it under a different name.`);
}

/**
 * Open or create a project owned by ownerAgentId.
 *
 *   { repo: 'owner/repo' }                  → GitHub-backed project (primary)
 *   { existingPath: 'C:\\...' }             → Wrap an existing local directory
 *   { } (no repo, no existingPath)          → Auto-create local folder under workspaces
 */
export async function openProject(ownerAgentId, { name, repo, existingPath, summary } = {}) {
  // A folder on its own is enough: it is named after its last part, so
  // "Open a folder" in a window's project chip or a file tree just works.
  const folderName = existingPath ? path.basename(path.resolve(String(existingPath))) : '';
  if (!name && !repo && !folderName) throw new Error('Provide a project name, a repo or a folder');

  const projectName = name || (repo ? repo.split('/')[1] || repo : folderName);

  if (repo) {
    return openGithubProject(ownerAgentId, { name: projectName, repo, summary });
  }
  return openLocalProject(ownerAgentId, { name: projectName, existingPath, summary });
}

export async function openGithubProject(ownerAgentId, { name, repo, summary }) {
  // Validate the repo exists and the token can read it.
  await getRepoInfo(repo);

  const existing = await findExistingGithubProject(repo);
  const owner = existing?.owner_agent_id || ownerAgentId;
  const { project, created } = await saveProject({
    existing,
    name,
    sourceKey: repoSourceKey(repo),
    findAgain: () => findExistingGithubProject(repo),
    // Never re-points a row: `repo` is written only into a row that has none.
    insert: (id) => pool.query(
      `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary)
       VALUES ($1, $2, $3, NULL, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         repo = CASE WHEN COALESCE(projects.repo, '') = '' THEN EXCLUDED.repo ELSE projects.repo END,
         summary = COALESCE(EXCLUDED.summary, projects.summary),
         updated_at = NOW()
       WHERE lower(projects.repo) = lower(EXCLUDED.repo)
          OR (COALESCE(projects.repo, '') = '' AND COALESCE(projects.path, '') = '')
       RETURNING *, (xmax = 0) AS is_new`,
      [id, owner, name, repo, summary || null]
    ),
  });

  if (created) await refreshProjectBrief(project);
  await logProjectActivity(project.id, ownerAgentId, 'opened', `${repo}`);
  return project;
}

export async function openLocalProject(ownerAgentId, { name, existingPath, summary }) {
  let projectPath;
  let runtimePath;
  if (existingPath) {
    projectPath = normalizeProjectPathForStorage(existingPath);
    runtimePath = resolveProjectPathForRuntime(projectPath);
    if (!fs.existsSync(runtimePath)) throw new Error(`Path does not exist: ${projectPath}`);
  } else {
    projectPath = path.join(getSharedWorkspaceDir(), 'projects', safeName(name));
    // Only a name was given. A project that already has that name is the one meant: it is
    // returned as it is, rather than a new empty project that would make the name fit two.
    // Several with that name: getProjectByName refuses and names them.
    const named = await getProjectByName(ownerAgentId, name);
    if (named && (named.repo || folderSourceKey(named.path) !== folderSourceKey(normalizeProjectPathForStorage(projectPath)))) {
      await logProjectActivity(named.id, ownerAgentId, 'opened', named.repo ? `${named.repo}` : `Local: ${named.path}`);
      return named;
    }
    await fs.promises.mkdir(projectPath, { recursive: true });
    runtimePath = projectPath;
  }

  const existing = await findExistingLocalProject(name, projectPath);
  const owner = existing?.owner_agent_id || ownerAgentId;

  const teamDir = path.join(runtimePath, '.team');
  await fs.promises.mkdir(path.join(teamDir, 'reports'), { recursive: true });
  await fs.promises.mkdir(path.join(teamDir, 'shared'), { recursive: true });
  await fs.promises.mkdir(path.join(teamDir, 'notes'), { recursive: true });

  const { project, created } = await saveProject({
    existing,
    name,
    sourceKey: folderSourceKey(projectPath),
    findAgain: () => findExistingLocalProject(name, projectPath),
    // Never re-points a row: `path` is written only into a row that has none.
    insert: (id) => pool.query(
      `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary)
       VALUES ($1, $2, $3, $4, NULL, $5)
       ON CONFLICT (id) DO UPDATE SET
         path = CASE WHEN COALESCE(projects.path, '') = '' THEN EXCLUDED.path ELSE projects.path END,
         summary = COALESCE(EXCLUDED.summary, projects.summary),
         updated_at = NOW()
       WHERE (COALESCE(projects.repo, '') = '' AND COALESCE(projects.path, '') = '')
          OR ${sameFolder('projects.path', 'EXCLUDED.path')}
       RETURNING *, (xmax = 0) AS is_new`,
      [id, owner, name, projectPath, summary || null]
    ),
  });

  if (created || !fs.existsSync(path.join(runtimePath, '.team', 'PROJECT.md'))) {
    await refreshProjectBrief(project);
  }
  await logProjectActivity(project.id, ownerAgentId, 'opened', `Local: ${projectPath}`);
  return project;
}

export async function listProjects(ownerAgentId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (COALESCE(repo, path, lower(name))) *
     FROM projects
     ORDER BY COALESCE(repo, path, lower(name)),
       CASE WHEN owner_agent_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC`,
    [ownerAgentId]
  );
  return rows.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

export async function getProject(projectId) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  return rows[0] || null;
}

export async function projectList(project, relPath = '.', { branch } = {}) {
  if (isGithubProject(project)) {
    const { listDir: ghListDir } = await import('../github.js');
    // "/" and "/src" mean the top of the repo, the same as on a folder project.
    const repoPath = String(relPath || '').replace(/^[\\/]+/, '');
    return ghListDir(project.repo, repoPath === '.' ? '' : repoPath, branch);
  }
  const { resolveInsideProject } = await import('./shared.js');
  const abs = resolveInsideProject(project.path, relPath);
  const entries = await fs.promises.readdir(abs, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
  }));
}
