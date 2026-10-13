// Board history (server/routes/boardHistory.js): the list of changes, the
// board at an earlier point, and rolling the board back to it.
async function historyRequest(path, options = {}) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Board history request failed (HTTP ${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const base = (workspaceId) => `/api/workspaces/${encodeURIComponent(workspaceId)}/history`;

export function getBoardHistory(workspaceId) {
  return historyRequest(base(workspaceId));
}

export function getBoardAt(workspaceId, seq) {
  return historyRequest(`${base(workspaceId)}/${encodeURIComponent(seq)}`);
}

export function restoreBoardTo(workspaceId, seq) {
  return historyRequest(`${base(workspaceId)}/${encodeURIComponent(seq)}/restore`, { method: 'POST' });
}
