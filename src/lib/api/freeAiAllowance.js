const STATUS_PATH = '/api/ai/free-tier/status';

export const FREE_AI_STATUS_UNAVAILABLE =
  'Free AI allowance is temporarily unavailable.';

function requireWorkspaceId(workspaceId) {
  const value = String(workspaceId ?? '').trim();
  if (!value) {
    const error = new Error('Open a workspace to check the free AI allowance.');
    error.code = 'workspace_required';
    throw error;
  }
  return value;
}

export async function getFreeAiAllowanceStatus(workspaceId) {
  const query = new URLSearchParams({ workspaceId: requireWorkspaceId(workspaceId) });
  const response = await fetch(`${STATUS_PATH}?${query.toString()}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(FREE_AI_STATUS_UNAVAILABLE);
    error.status = response.status;
    error.code = typeof payload?.error === 'string' ? payload.error : 'free_ai_status_unavailable';
    throw error;
  }
  if (payload?.enabled !== true && payload?.enabled !== false) {
    throw new Error(FREE_AI_STATUS_UNAVAILABLE);
  }
  return payload;
}
