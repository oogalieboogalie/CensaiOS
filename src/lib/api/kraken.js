// Kraken Requests (server/routes/agents/krakenRequests.js): a pasted report,
// split into findings and handed to the family.

async function read(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || 'Could not reach your Kraken Requests.'), { status: response.status });
  }
  return data;
}

function post(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(read);
}

/**
 * Who would get each finding, and in which project, without starting anything:
 * { title, arms, dropped, pin }. projectId: the id of the project the name stands for, when the
 * window knows it. pin: the exact project found (which one, where its code is, which branch).
 */
export function previewKraken({ workspaceId, report, mode, project, projectId }) {
  return post('/api/kraken/preview', { workspaceId, report, mode, project, projectId });
}

/**
 * Hand the report out in the project the look pinned. pin: the look's pin, sent back as it came;
 * the server checks it still names the same project. only: the finding numbers to keep. Returns the request.
 */
export async function releaseKraken({ workspaceId, report, mode, project, pin, only }) {
  return (await post('/api/kraken/requests', { workspaceId, report, mode, project, pin, only })).request;
}

/** The person's requests on this board, newest first. Looking also hands out arms that were waiting. */
export async function getKrakenRequests({ workspaceId }) {
  const params = new URLSearchParams();
  if (workspaceId) params.set('workspaceId', workspaceId);
  const data = await fetch(`/api/kraken/requests?${params}`).then(read);
  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function stopKraken({ workspaceId, id }) {
  return (await post(`/api/kraken/requests/${encodeURIComponent(id)}/stop`, { workspaceId })).request;
}
