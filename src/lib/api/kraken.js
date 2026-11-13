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

/** Who would get each finding, without starting anything: { title, arms, dropped }. */
export function previewKraken({ workspaceId, report, mode, project }) {
  return post('/api/kraken/preview', { workspaceId, report, mode, project });
}

/** Hand the report out. only: the finding numbers to keep. Returns the request. */
export async function releaseKraken({ workspaceId, report, mode, project, only }) {
  return (await post('/api/kraken/requests', { workspaceId, report, mode, project, only })).request;
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
