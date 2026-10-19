// Censai the orchestrator: the person's plans (server/routes/agents/censaiPlans.js).

async function read(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || 'Could not reach your plans.'), { status: response.status });
  }
  return data;
}

function post(path, workspaceId) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId }),
  }).then(read);
}

/** Plans still running, or finished and not yet told in the chat. */
export async function getOpenPlans({ workspaceId }) {
  const params = new URLSearchParams({ open: '1' });
  if (workspaceId) params.set('workspaceId', workspaceId);
  const data = await fetch(`/api/censai/plans?${params}`).then(read);
  return Array.isArray(data?.plans) ? data.plans : [];
}

/** { first, plan }: first is true for the one tab that posts the result line. */
export function markPlanTold({ workspaceId, id }) {
  return post(`/api/censai/plans/${encodeURIComponent(id)}/reported`, workspaceId);
}

export async function stopPlanRun({ workspaceId, id }) {
  return (await post(`/api/censai/plans/${encodeURIComponent(id)}/stop`, workspaceId)).plan;
}
