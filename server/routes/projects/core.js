import fs from 'fs';
import { listProjects, openProject } from '../../workspaces.js';
import { ensureProjectBrief } from '../../workspaces/briefs.js';
import { resolveProjectPathForRuntime } from '../../workspaces/shared.js';
import { isCloudRuntime } from '../../middleware/runtimeMode.js';
import { projectFolderKey, tidyProjectList } from '../../../shared/projects/projectList.js';
import { OWNER_UNCHECKED_MESSAGE } from '../../security/systemAdmin.js';
import {
  CORE_PROJECT_OWNERS, readCurrentProject, writeCurrentProject,
  assertDirectory, inferProjectName, registerOpenProject,
  listOpenProjectRoots,
} from './shared.js';
import { projectsFor } from './teammateProjects.js';
import { runAsGithubPerson } from '../../github/credential.js';
import { createLogger } from '../../logger.js';
import { safeErrorCode } from '../../security/errorCode.js';

const log = createLogger('projects');

// The board's default project is open on every board here, so anyone signed
// in may know it, as Files and a window's project menu already show it.
export async function getCurrentProject(req, res) {
  try {
    res.json({ project: await readCurrentProject() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// The projects open on this board (default first), for the per-window
// project menu.
export async function listOpenProjectsHandler(req, res) {
  try {
    res.json({ projects: await listOpenProjectRoots() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// A folder that was deleted or moved has no place in a list to pick from.
// Only "not there" drops it: a folder this server may not read stays listed.
export async function folderIsGone(storedPath) {
  try {
    const stats = await fs.promises.stat(resolveProjectPathForRuntime(storedPath));
    return !stats.isDirectory();
  } catch (err) {
    return err?.code === 'ENOENT' || err?.code === 'ENOTDIR';
  }
}

/**
 * Rows of the projects table, tidied for a menu: each folder and each GitHub
 * repo once, no agent worktrees or temp folders, no folder that is gone, the
 * board's default project first and then the most recently used. A folder
 * someone opened on the board stays even when it looks like a helper's, and
 * says so (`opened`) so each menu keeps it too. A row whose folder is gone
 * but that has a GitHub repo stays as that repo.
 */
export async function tidyProjectsForMenu(rows, {
  current = null, openFolders = [], checkFolders = !isCloudRuntime(), isGone = folderIsGone,
} = {}) {
  const opened = new Set(openFolders.map(projectFolderKey).filter(Boolean));
  const projects = (rows || []).map(project => ({
    id: project.id,
    name: project.name,
    path: project.path,
    repo: project.repo,
    summary: project.summary,
    ownerAgentId: project.owner_agent_id,
    updatedAt: project.updated_at,
    ...(project.path && opened.has(projectFolderKey(project.path)) ? { opened: true } : {}),
  }));
  const tidy = tidyProjectList(projects, current, { keepFolders: openFolders });
  if (!checkFolders) return tidy;
  const gone = await Promise.all(tidy.map(p => (p.path ? isGone(p.path) : false)));
  return tidy.flatMap((p, i) => {
    if (!gone[i]) return [p];
    if (!p.repo) return [];
    const { opened: _opened, ...repoOnly } = p;
    return [{ ...repoOnly, path: null }];
  });
}

// Every project on this computer for its owner; anyone else gets the ones
// open on this computer's boards and the ones their boards give their agents.
export async function listAllProjects(req, res) {
  let projects;
  try {
    projects = await listProjects(CORE_PROJECT_OWNERS[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  try {
    projects = await projectsFor(req, projects);
  } catch {
    return res.status(503).json({ error: OWNER_UNCHECKED_MESSAGE });
  }
  let current = null;
  try { current = await readCurrentProject(); } catch { /* quiet: with no readable default, none goes first */ }
  let openFolders = [];
  try { openFolders = (await listOpenProjectRoots()).map(root => root.path); } catch { /* quiet: then only the default is kept for being open */ }
  res.json({ projects: await tidyProjectsForMenu(projects, { current, openFolders }) });
}

export async function updateCurrentProject(req, res) {
  const { path: projectPath, name, summary } = req.body || {};
  if (!projectPath || typeof projectPath !== 'string') {
    return res.status(400).json({ error: 'Project path is required' });
  }

  try {
    const resolvedPath = await assertDirectory(projectPath);
    const projectName = (name || inferProjectName(resolvedPath)).trim();
    const project = await openProject(CORE_PROJECT_OWNERS[0], {
      name: projectName,
      existingPath: resolvedPath,
      summary: summary || null,
    });

    const currentProject = {
      type: 'local',
      name: projectName,
      path: resolvedPath,
      projectId: project.id,
      openedBy: project.owner_agent_id,
      ownerAgentIds: CORE_PROJECT_OWNERS,
      projects: CORE_PROJECT_OWNERS.map(owner => ({
        ownerAgentId: owner,
        projectId: project.id,
        name: project.name,
        path: project.path,
      })),
      failures: [],
      updatedAt: new Date().toISOString(),
    };

    await writeCurrentProject(currentProject);
    // Keep the root browseable even after the user switches the global
    // default to another project (multi-project canvas).
    await registerOpenProject(resolvedPath);
    res.json({ project: currentProject });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function openProjectHandler(req, res) {
  const { name, repo, path: projectPath, summary } = req.body || {};
  if (!repo && !projectPath && !name) {
    return res.status(400).json({ error: 'Provide a project name, repo, or path.' });
  }

  try {
    const existingPath = projectPath ? await assertDirectory(projectPath) : undefined;
    // A project kept on GitHub is read with the saved GitHub key of whoever opens it.
    const project = await runAsGithubPerson({ userId: req.session?.userId, computerKey: true }, () => openProject(CORE_PROJECT_OWNERS[0], {
      // A folder opened by its path alone is named after the folder.
      name: String(name || '').trim() || (existingPath ? inferProjectName(existingPath) : undefined),
      repo: String(repo || '').trim() || undefined,
      existingPath,
      summary: String(summary || '').trim() || undefined,
    }));
    // A GitHub project whose brief the app no longer has gets it built again (reads only).
    if (project.repo) {
      await runAsGithubPerson({ userId: req.session?.userId, computerKey: true }, () => ensureProjectBrief(project))
        .catch((err) => log.warn('project brief not built on open', { code: safeErrorCode(err) }));
    }
    // Opening a folder alongside the default puts it on the board without
    // moving any other window (multi-project canvas).
    if (existingPath) await registerOpenProject(existingPath);

    res.json({
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        repo: project.repo,
        summary: project.summary,
        ownerAgentId: project.owner_agent_id,
        updatedAt: project.updated_at,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
