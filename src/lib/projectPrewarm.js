import { syncCanvasProjectMemberships } from './api/projectMemberships.js';
import { isProjectAware, resolveWindowProject, samePath } from './windowProject.js';

export function resolveWorkspaceProject(workspaceState, legacyProject = null) {
  return workspaceState?.currentProject || legacyProject || null;
}

export function deriveCanvasProjectMemberships({ wins = [], canvasGroups = [] } = {}) {
  const agentIds = new Set();
  for (const win of wins) {
    if (win?.agentId) agentIds.add(String(win.agentId));
    for (const agentId of win?.attachedAgents || []) agentIds.add(String(agentId));
  }
  for (const group of canvasGroups) {
    for (const agentId of group?.attachedAgents || []) agentIds.add(String(agentId));
  }
  return [...agentIds]
    .filter(Boolean)
    .sort()
    .map((agentId) => ({ agentId, permission: 'work' }));
}

/**
 * A window set to its own project (the window's project menu) gives its agent
 * that project too, with the same access the board's main project gives it.
 * One entry per project, each naming the agents whose windows work there. A
 * window that follows the board's main project adds nothing. The server finds
 * the project by its folder when the window only knows the folder.
 */
export function deriveWindowProjectMemberships({ wins = [], canvasGroups = [], currentProject = null } = {}) {
  const boardAccess = new Map(
    deriveCanvasProjectMemberships({ wins, canvasGroups }).map((row) => [row.agentId, row.permission]),
  );
  const byProject = new Map();
  for (const win of wins) {
    if (!win?.agentId || !isProjectAware(win)) continue;
    const project = resolveWindowProject(win, { wins, canvasGroups, boardDefault: currentProject });
    if (!project?.path || samePath(project.path, currentProject?.path)) continue;
    if (project.projectId && project.projectId === currentProject?.projectId) continue;
    const projectKey = project.projectId || project.path;
    const entry = byProject.get(projectKey) || {
      ...(project.projectId ? { projectId: project.projectId } : {}),
      path: project.path,
      agents: new Set(),
    };
    entry.agents.add(String(win.agentId));
    byProject.set(projectKey, entry);
  }
  return [...byProject.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ agents, ...project }) => ({
      ...project,
      memberships: [...agents].sort().map((agentId) => ({ agentId, permission: boardAccess.get(agentId) || 'work' })),
    }));
}

/** Everything a board save hands its agents; it changes when any of it does. */
export function deriveBoardProjectAccess(workspace = {}) {
  return {
    memberships: deriveCanvasProjectMemberships(workspace),
    windowProjects: deriveWindowProjectMemberships(workspace),
  };
}

export async function syncCanvasProjectPrewarm({ workspaceId, currentProject, wins, canvasGroups }) {
  if (!workspaceId || !currentProject?.projectId) return [];
  const { memberships, windowProjects } = deriveBoardProjectAccess({ wins, canvasGroups, currentProject });
  return syncCanvasProjectMemberships({
    workspaceId,
    projectId: currentProject.projectId,
    sourceId: workspaceId,
    memberships,
    windowProjects,
  });
}

export async function persistWorkspaceWithPrewarm({ api, workspace, expectedRevision, canvasSource = null }) {
  const saved = canvasSource
    ? await api.saveWorkspace(workspace, expectedRevision, { canvasSource })
    : await api.saveWorkspace(workspace, expectedRevision);
  try {
    await syncCanvasProjectPrewarm({
      workspaceId: workspace.workspaceId,
      currentProject: workspace.currentProject,
      wins: workspace.wins,
      canvasGroups: workspace.canvasGroups,
    });
    return { ...saved, prewarmSynced: true };
  } catch (error) {
    return { ...saved, prewarmSynced: false, prewarmError: error.message };
  }
}
