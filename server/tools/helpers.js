import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { getSubAgentById } from '../memory.js';
import { getProject, getProjectByName, getProjectByRepoOrPath, listProjects, openProject } from '../workspaces.js';
import { getSecret } from '../secrets.js';
import { githubApiUrl } from '../github/apiUrl.js';
import { resolveProjectForDriver } from '../workspaces/ownerProjectLookup.js';
import { refusePastWork } from '../workspaces/familyPast.js';
import { noteToolFailure } from './toolsLog.js';
import { refuseProjectsOffBoard } from './rbac/ownerOnlyReads.js';
import { jobProjectFor } from './jobProject.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The same file the project routes keep (server/routes/projects/shared.js);
// CENSAI_STATE_DIR moves local state for tests and sandboxes.
const currentProjectFile = () => path.join(
  process.env.CENSAI_STATE_DIR ? path.resolve(process.env.CENSAI_STATE_DIR) : path.resolve(__dirname, '..', '..', '.homebase-state'),
  'current-project.json',
);

/** The project open on this computer (the top bar's), or null. */
async function readCurrentProjectState() {
  try {
    return JSON.parse(await fs.promises.readFile(currentProjectFile(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') noteToolFailure('could not read the open project', {}, error);
    return null;
  }
}

async function maybeOpenCurrentProject(agentId, projectName) {
  const current = await readCurrentProjectState();
  if (!current?.path || current.type !== 'local') return null;

  const wanted = String(projectName || '').trim().toLowerCase();
  const currentName = String(current.name || '').trim().toLowerCase();
  const currentPath = String(current.path || '').trim().toLowerCase();
  const pathName = path.basename(current.path).toLowerCase();

  const matches = !wanted ||
    wanted === currentName ||
    wanted === currentPath ||
    wanted === pathName ||
    current.projects?.some(project =>
      String(project.name || '').trim().toLowerCase() === wanted ||
      String(project.path || '').trim().toLowerCase() === wanted ||
      String(project.projectId || '').trim().toLowerCase() === wanted
    );

  if (!matches) return null;
  return openProject(agentId, {
    name: current.name || path.basename(current.path),
    existingPath: current.path,
    summary: current.scopeLabel
      ? `Canvas scoped project: ${current.scopeLabel}`
      : 'Current Homebase project',
  });
}

// Off a board, one way to find a project by what an agent called it. Agents
// often pass "owner/repo" for a project opened from a GitHub repo (stored
// under just "repo"), so: its id, its name, the last `/`-segment, its repo or
// path, then the project open on this computer when that is the one meant.
async function namedProject(agentId, projectName) {
  let p = await getProject(projectName);
  if (!p) p = await getProjectByName(agentId, projectName);
  if (!p && projectName.includes('/')) p = await getProjectByName(agentId, projectName.split('/').pop());
  // Core projects are shared; owner only records who opened the row first.
  if (!p) p = await getProjectByRepoOrPath(agentId, projectName);
  // The canvas can know a project the database has not been seeded with yet.
  if (!p) p = await maybeOpenCurrentProject(agentId, projectName);
  return p;
}

// Off a board, the project a call means when it names none: the one open on
// this computer, and only when there is none, the one worked in last.
async function defaultProject(agentId) {
  const current = await readCurrentProjectState();
  if (current?.type === 'local' && current.path) {
    const open = (current.projectId && await getProject(current.projectId))
      || await getProjectByRepoOrPath(agentId, current.path);
    if (open) return open;
  }
  const projects = await listProjects(agentId);
  return projects[0] || await maybeOpenCurrentProject(agentId, null);
}

async function noSuchProject(agentId, projectName) {
  const projects = await listProjects(agentId);
  const projectList = projects.length ? projects.map(x => `"${x.name}"${x.repo ? ` (${x.repo})` : x.path ? ` (${x.path})` : ''}`).join(', ') : 'none';
  return `No shared project matching "${projectName}". Available projects: ${projectList}. Use open_project to add the project once; all core agents can use it after that.`;
}

// Resolve which project a tool call should operate against.
// - On a board: a project the board gave the agent, or any project on this
//   computer when its owner drives the chat (workspaces/ownerProjects.js).
// - Off a board: for this computer's owner's agents only (refuseProjectsOffBoard).
//   A named project is that project or a refusal, never a different one. No
//   name means the project open on this computer, then the most recent.
// - Sub-agents live on a board: no name means their task's project, then the
//   one they are bound to.
// - The family's past is read only for every agent and every driver, the
//   owner included (workspaces/familyPast.js).
export async function resolveProjectForCall(agentId, projectName, context = {}) {
  const found = await findProjectForCall(agentId, projectName, context);
  refusePastWork(found.project, context.requiredProjectPermission);
  return found;
}

async function findProjectForCall(agentId, projectName, context) {
  await refuseProjectsOffBoard(context);
  const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  if (context.workspaceId) {
    // On a job Censai handed off, no name means the job's project (jobProject.js).
    let projectIdentifier = projectName || jobProjectFor(agentId) || null;
    if (!projectIdentifier && sub && context.agentTaskId) {
      const { rows } = await pool.query(
        'SELECT project_id, project FROM agent_tasks WHERE id = $1',
        [context.agentTaskId]
      );
      projectIdentifier = rows[0]?.project_id || rows[0]?.project || null;
    }
    if (!projectIdentifier && sub?.project_id) projectIdentifier = sub.project_id;
    const project = await resolveProjectForDriver(pool, {
      workspaceId: context.workspaceId,
      agentId: sub?.parent_id || agentId,
      projectIdentifier,
      requiredPermission: context.requiredProjectPermission || 'read',
    }, context);
    return { project, isSubAgent: Boolean(sub) };
  }
  const p = projectName ? await namedProject(agentId, projectName) : await defaultProject(agentId);
  if (!p) {
    if (projectName) throw new Error(await noSuchProject(agentId, projectName));
    throw new Error('There are no shared projects yet. Use open_project to create one.');
  }
  return { project: p, isSubAgent: false };
}

export async function resolveLocalProjectRoot(agentId, projectName, context = {}) {
  if (!projectName) return null;
  const { project } = await resolveProjectForCall(agentId, projectName, context);
  if (project?.repo) {
    throw new Error(`Project "${project.name}" is GitHub-backed. Runtime tools need a local project path.`);
  }
  if (!project?.path) {
    throw new Error(`Project "${project.name || projectName}" does not have a local path.`);
  }
  const { resolveProjectPathForRuntime } = await import('../workspaces/shared.js');
  return resolveProjectPathForRuntime(project.path);
}

export async function fetchGithub(endpoint, options = {}) {
  const token = getSecret('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN not configured in .env');
  const needsContentType = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
  const res = await fetch(`${githubApiUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Homebase-Agent',
      ...(needsContentType ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  return res.json();
}

export function localApiUrl(path) {
  const port = process.env.PORT || 3001;
  const base = process.env.INTERNAL_API_BASE_URL || `http://127.0.0.1:${port}`;
  return `${base}${path}`;
}
