export async function getWorkspaceAgentProjects(workspaceId, agentId = null) {
  const params = new URLSearchParams();
  if (agentId) params.set('agentId', agentId);
  const suffix = params.size ? `?${params}` : '';
  const res = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/agent-projects${suffix}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load project memberships');
  return data.memberships || [];
}

export async function syncCanvasProjectMemberships({ workspaceId, projectId, memberships, sourceId }) {
  const res = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/agent-projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberships, sourceId }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to sync project memberships');
  return data.memberships || [];
}
