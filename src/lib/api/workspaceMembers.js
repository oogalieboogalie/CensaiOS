async function workspaceMemberRequest(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Workspace member request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

export function getWorkspaceMembers(workspaceId) {
  return workspaceMemberRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`);
}

export function inviteWorkspaceMember(workspaceId, email) {
  return workspaceMemberRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export function getPersonalWorkspace() {
  return workspaceMemberRequest('/api/workspaces/personal', { method: 'POST' });
}

export function leaveWorkspace(workspaceId) {
  return workspaceMemberRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/members/me`, {
    method: 'DELETE',
  });
}
