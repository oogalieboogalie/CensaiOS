export async function getAgentActivity(agentId) {
  const res = await fetch(`/api/agent-wakeups/${encodeURIComponent(agentId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to load agent activity');
  return data;
}

export async function getMailActivity({ workspaceId, since = null } = {}) {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);
  if (since) params.set('since', since);
  const res = await fetch(`/api/mail-activity?${params.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Failed to load mail activity');
  return data?.messages || [];
}
