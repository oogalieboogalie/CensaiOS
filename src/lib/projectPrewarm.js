import { syncCanvasProjectMemberships } from './api/projectMemberships.js';

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

export async function syncCanvasProjectPrewarm({ workspaceId, currentProject, wins, canvasGroups }) {
  if (!workspaceId || !currentProject?.projectId) return [];
  return syncCanvasProjectMemberships({
    workspaceId,
    projectId: currentProject.projectId,
    sourceId: workspaceId,
    memberships: deriveCanvasProjectMemberships({ wins, canvasGroups }),
  });
}

export async function persistWorkspaceWithPrewarm({ api, workspace, expectedRevision }) {
  const saved = await api.saveWorkspace(workspace, expectedRevision);
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
