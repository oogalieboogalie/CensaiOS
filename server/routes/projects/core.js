import { listProjects, openProject } from '../../workspaces.js';
import {
  CORE_PROJECT_OWNERS, readCurrentProject, writeCurrentProject,
  assertDirectory, inferProjectName, registerOpenProject,
  listOpenProjectRoots,
} from './shared.js';

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

export async function listAllProjects(req, res) {
  try {
    const projects = await listProjects(CORE_PROJECT_OWNERS[0]);
    res.json({
      projects: projects.map(project => ({
        id: project.id,
        name: project.name,
        path: project.path,
        repo: project.repo,
        summary: project.summary,
        ownerAgentId: project.owner_agent_id,
        updatedAt: project.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const project = await openProject(CORE_PROJECT_OWNERS[0], {
      // A folder opened by its path alone is named after the folder.
      name: String(name || '').trim() || (existingPath ? inferProjectName(existingPath) : undefined),
      repo: String(repo || '').trim() || undefined,
      existingPath,
      summary: String(summary || '').trim() || undefined,
    });
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
