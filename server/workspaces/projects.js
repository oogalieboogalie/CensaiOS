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

export function sharedProjectIdFor(name) {
  return `shared-${safeName(name)}`;
}

export async function findExistingGithubProject(repo) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE repo = $1
     ORDER BY updated_at DESC
     LIMIT 1`,
    [repo]
  );
  return rows[0] || null;
}

export async function findExistingLocalProject(name, projectPath) {
  const absPath = projectPath ? normalizeProjectPathForStorage(projectPath) : null;
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE ($1::text IS NOT NULL AND path = $1)
        OR lower(name) = lower($2)
     ORDER BY
       CASE WHEN owner_agent_id = 'shared' THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT 1`,
    [absPath, name]
  );
  return rows[0] || null;
}

/**
 * Open or create a project owned by ownerAgentId.
 *
 *   { repo: 'owner/repo' }                  → GitHub-backed project (primary)
 *   { existingPath: 'C:\\...' }             → Wrap an existing local directory
 *   { } (no repo, no existingPath)          → Auto-create local folder under workspaces
 */
export async function openProject(ownerAgentId, { name, repo, existingPath, summary } = {}) {
  if (!name && !repo) throw new Error('Provide a project name or a repo');

  // Default the project name from the repo if none supplied
  const projectName = name || repo.split('/')[1] || repo;

  if (repo) {
    return openGithubProject(ownerAgentId, { name: projectName, repo, summary });
  }
  return openLocalProject(ownerAgentId, { name: projectName, existingPath, summary });
}

export async function openGithubProject(ownerAgentId, { name, repo, summary }) {
  // Validate the repo exists and the token can read it.
  await getRepoInfo(repo);

  const existing = await findExistingGithubProject(repo);
  const id = existing?.id || sharedProjectIdFor(name);
  const owner = existing?.owner_agent_id || ownerAgentId;
  const { rows } = await pool.query(
    `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary)
     VALUES ($1, $2, $3, NULL, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       repo = EXCLUDED.repo,
       summary = COALESCE(EXCLUDED.summary, projects.summary),
       updated_at = NOW()
     RETURNING *`,
    [id, owner, name, repo, summary || null]
  );
  const project = rows[0];

  if (!existing) await refreshProjectBrief(project);
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
    await fs.promises.mkdir(projectPath, { recursive: true });
    runtimePath = projectPath;
  }

  const existing = await findExistingLocalProject(name, projectPath);
  const id = existing?.id || sharedProjectIdFor(name);
  const owner = existing?.owner_agent_id || ownerAgentId;

  const teamDir = path.join(runtimePath, '.team');
  await fs.promises.mkdir(path.join(teamDir, 'reports'), { recursive: true });
  await fs.promises.mkdir(path.join(teamDir, 'shared'), { recursive: true });
  await fs.promises.mkdir(path.join(teamDir, 'notes'), { recursive: true });

  const { rows } = await pool.query(
    `INSERT INTO projects (id, owner_agent_id, name, path, repo, summary)
     VALUES ($1, $2, $3, $4, NULL, $5)
     ON CONFLICT (id) DO UPDATE SET
       path = EXCLUDED.path,
       summary = COALESCE(EXCLUDED.summary, projects.summary),
       updated_at = NOW()
     RETURNING *`,
    [id, owner, name, projectPath, summary || null]
  );
  const project = rows[0];

  if (!existing || !fs.existsSync(path.join(runtimePath, '.team', 'PROJECT.md'))) {
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

export async function getProjectByName(ownerAgentId, name) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE lower(name) = lower($2)
     ORDER BY
       CASE WHEN owner_agent_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT 1`,
    [ownerAgentId, name]
  );
  return rows[0] || null;
}

export async function getProjectByRepoOrPath(ownerAgentId, value) {
  const { rows } = await pool.query(
    `SELECT * FROM projects
     WHERE repo = $2
        OR ($2 NOT LIKE '%/%' AND repo LIKE $3)
        OR path = $2
     ORDER BY
       CASE WHEN owner_agent_id = $1 THEN 0 ELSE 1 END,
       updated_at DESC
     LIMIT 1`,
    [ownerAgentId, value, `%/${value}`]
  );
  return rows[0] || null;
}

export async function projectList(project, relPath = '.', { branch } = {}) {
  if (isGithubProject(project)) {
    const { listDir: ghListDir } = await import('../github.js');
    return ghListDir(project.repo, relPath === '.' ? '' : relPath, branch);
  }
  const { resolveInsideProject } = await import('./shared.js');
  const abs = resolveInsideProject(project.path, relPath);
  const entries = await fs.promises.readdir(abs, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
  }));
}
