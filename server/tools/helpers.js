import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';
import { getSubAgentById } from '../memory.js';
import { getProject, getProjectByName, getProjectByRepoOrPath, listProjects, openProject } from '../workspaces.js';
import { getSecret } from '../secrets.js';
import {
  assertAgentProjectAccess,
} from '../workspaces/projectMemberships.js';
import { resolveAuthorizedWorkspaceProject } from '../workspaces/projectAccess.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURRENT_PROJECT_FILE = path.resolve(path.join(__dirname, '..', '..', '.homebase-state', 'current-project.json'));

async function readCurrentProjectState() {
  try {
    const raw = await fs.promises.readFile(CURRENT_PROJECT_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
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

async function authorizedProjectResult(agentId, project, isSubAgent, context) {
  if (context.workspaceId) {
    const sub = isSubAgent ? await getSubAgentById(agentId, context) : null;
    await assertAgentProjectAccess(pool, {
      workspaceId: context.workspaceId,
      projectId: project.id,
      agentId: sub?.parent_id || agentId,
      requiredPermission: context.requiredProjectPermission || 'read',
    });
  }
  return { project, isSubAgent };
}

// Resolve which project a tool call should operate against.
// - Sub-agents: bound project (always).
// - Head agents: project name from args, or most-recent if omitted.
// Forgiving lookup: agents often pass "owner/repo" as the project name when the
// project was opened from a GitHub repo (stored under just "repo"). Try the
// literal name first, then fall back to matching the last `/`-segment OR the
// `repo` field directly, before giving up.
export async function resolveProjectForCall(agentId, projectName, context = {}) {
  const sub = context.workspaceId ? await getSubAgentById(agentId, context) : null;
  if (context.workspaceId) {
    let projectIdentifier = projectName || null;
    if (!projectIdentifier && sub && context.agentTaskId) {
      const { rows } = await pool.query(
        'SELECT project_id, project FROM agent_tasks WHERE id = $1',
        [context.agentTaskId]
      );
      projectIdentifier = rows[0]?.project_id || rows[0]?.project || null;
    }
    if (!projectIdentifier && sub?.project_id) projectIdentifier = sub.project_id;
    const project = await resolveAuthorizedWorkspaceProject(pool, {
      workspaceId: context.workspaceId,
      agentId: sub?.parent_id || agentId,
      projectIdentifier,
      requiredPermission: context.requiredProjectPermission || 'read',
    });
    return { project, isSubAgent: Boolean(sub) };
  }
  if (sub) {
    let p = null;
    if (projectName) {
      p = await getProject(projectName);
      if (!p) p = await getProjectByName(agentId, projectName);
      if (!p && projectName.includes('/')) p = await getProjectByName(agentId, projectName.split('/').pop());
      if (!p) p = await getProjectByRepoOrPath(agentId, projectName);
    }

    if (!p && context.agentTaskId) {
      try {
        const { rows } = await pool.query('SELECT project_id, project FROM agent_tasks WHERE id = $1', [context.agentTaskId]);
        if (rows[0]) {
          const taskId = rows[0].project_id;
          const taskProjectStr = rows[0].project;
          if (taskId) {
            p = await getProject(taskId);
          }
          if (!p && taskProjectStr) {
            p = await getProject(taskProjectStr);
            if (!p) p = await getProjectByName(agentId, taskProjectStr);
            if (!p && taskProjectStr.includes('/')) p = await getProjectByName(agentId, taskProjectStr.split('/').pop());
            if (!p) p = await getProjectByRepoOrPath(agentId, taskProjectStr);
          }
        }
      } catch (dbErr) {
        console.warn(`[resolveProjectForCall] Failed to fetch task project scope for task ${context.agentTaskId}:`, dbErr.message);
      }
    }

    if (!p && sub.project_id) {
      p = await getProject(sub.project_id);
    }

    if (!p) {
      const projects = await listProjects(agentId);
      if (projects.length > 0) {
        p = projects[0];
      }
    }

    if (!p) {
      p = await maybeOpenCurrentProject(agentId, projectName);
    }

    if (!p) {
      throw new Error('This sub-agent has no project context. Please open a project first.');
    }
    return authorizedProjectResult(agentId, p, true, context);
  }
  if (projectName) {
    // 0) Try exact ID match first (handles "agent-project" formats passed by agents or frontend context)
    let p = await getProject(projectName);

    // 1) Exact name match
    if (!p) {
      p = await getProjectByName(agentId, projectName);
    }
    // 2) If name looks like "owner/repo", try just the repo segment
    if (!p && projectName.includes('/')) {
      p = await getProjectByName(agentId, projectName.split('/').pop());
    }
    // 3) Match globally by repo or path. Core projects are shared; owner only
    // records who opened the row first.
    if (!p) {
      p = await getProjectByRepoOrPath(agentId, projectName);
    }
    // 4) If the frontend has a current project selected, materialize it once.
    // This avoids "project not found" when the canvas knows the workspace but
    // the DB has not yet been seeded for the calling agent/process.
    if (!p) {
      p = await maybeOpenCurrentProject(agentId, projectName);
    }
    if (!p) {
      const projects = await listProjects(agentId);
      const projectList = projects.length ? projects.map(x => `"${x.name}"${x.repo ? ` (${x.repo})` : x.path ? ` (${x.path})` : ''}`).join(', ') : 'none';
      throw new Error(`No shared project matching "${projectName}". Available projects: ${projectList}. Use open_project to add the project once; all core agents can use it after that.`);
    }
    return authorizedProjectResult(agentId, p, false, context);
  }
  const projects = await listProjects(agentId);
  if (!projects[0]) {
    const current = await maybeOpenCurrentProject(agentId, null);
    if (current) return authorizedProjectResult(agentId, current, false, context);
    throw new Error('There are no shared projects yet. Use open_project to create one.');
  }
  return authorizedProjectResult(agentId, projects[0], false, context);
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
  const res = await fetch(`https://api.github.com${endpoint}`, {
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
