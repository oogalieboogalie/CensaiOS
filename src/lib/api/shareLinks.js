// Guest links (spec 5): the owner's share-link manager, members' comment
// pins, and the account-free guest endpoints under /api/guest.

async function shareRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: 'include',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return payload;
}

const ws = (workspaceId) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

export function listShareLinks(workspaceId) {
  return shareRequest(`${ws(workspaceId)}/share-links`);
}

export function createShareLink(workspaceId, input) {
  return shareRequest(`${ws(workspaceId)}/share-links`, { method: 'POST', body: input });
}

export function revokeShareLink(workspaceId, linkId) {
  return shareRequest(`${ws(workspaceId)}/share-links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
}

export function listShareLinkJoins(workspaceId, linkId) {
  return shareRequest(`${ws(workspaceId)}/share-links/${encodeURIComponent(linkId)}/joins`);
}

export function controlLiveShow(workspaceId, body) {
  return shareRequest(`${ws(workspaceId)}/live`, { method: 'POST', body });
}

export function setWindowPublic(workspaceId, windowId, isPublic) {
  return shareRequest(`${ws(workspaceId)}/windows/${encodeURIComponent(windowId)}/public`, {
    method: 'POST', body: { public: Boolean(isPublic) },
  });
}

export function listBoardComments(workspaceId) {
  return shareRequest(`${ws(workspaceId)}/comments`);
}

export function postBoardComment(workspaceId, input) {
  return shareRequest(`${ws(workspaceId)}/comments`, { method: 'POST', body: input });
}

export function resolveBoardComment(workspaceId, commentId, resolved = true) {
  return shareRequest(`${ws(workspaceId)}/comments/${encodeURIComponent(commentId)}/resolve`, {
    method: 'POST', body: { resolved },
  });
}

// ─── guest side ───────────────────────────────────────────────────────

export function previewGuestLink(token) {
  return shareRequest(`/api/guest/links/${encodeURIComponent(token)}`);
}

export function joinGuestLink(token, { name, color, passcode }) {
  return shareRequest(`/api/guest/links/${encodeURIComponent(token)}/join`, {
    method: 'POST', body: { name, color, passcode },
  });
}

export function getGuestSession() {
  return shareRequest('/api/guest/session');
}

export function leaveGuestSession() {
  return shareRequest('/api/guest/leave', { method: 'POST' });
}

export function getGuestBoard() {
  return shareRequest('/api/guest/board');
}

export function listGuestComments() {
  return shareRequest('/api/guest/comments');
}

export function postGuestComment(input) {
  return shareRequest('/api/guest/comments', { method: 'POST', body: input });
}

export function resolveGuestComment(commentId, resolved = true) {
  return shareRequest(`/api/guest/comments/${encodeURIComponent(commentId)}/resolve`, {
    method: 'POST', body: { resolved },
  });
}
