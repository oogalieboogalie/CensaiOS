const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

export function requestedWorkspaceId(search = globalThis.location?.search || '') {
  const value = new URLSearchParams(search).get('workspace')?.trim() || '';
  return WORKSPACE_ID_PATTERN.test(value) ? value : null;
}

export function workspaceShareLink(workspaceId, locationLike = globalThis.location) {
  const id = String(workspaceId || '').trim();
  if (!WORKSPACE_ID_PATTERN.test(id)) return '';
  const base = locationLike?.href
    || `${locationLike?.origin || ''}${locationLike?.pathname || '/'}`;
  const url = new URL(base);
  url.searchParams.set('workspace', id);
  url.hash = '';
  return url.toString();
}

export function navigateToWorkspace(workspaceId, locationLike = globalThis.location) {
  const href = workspaceShareLink(workspaceId, locationLike);
  if (href) locationLike?.assign?.(href);
  return href;
}

// Guest links (spec 5): `?join=<token>` opens the board as a guest. The token
// is the permission, so it is only ever read from the URL, never logged.
const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function guestJoinToken(search = globalThis.location?.search || '') {
  const value = new URLSearchParams(search).get('join')?.trim() || '';
  return JOIN_TOKEN_PATTERN.test(value) ? value : null;
}

export function guestLinkUrl(token, locationLike = globalThis.location) {
  if (!JOIN_TOKEN_PATTERN.test(String(token || ''))) return '';
  const url = new URL(`${locationLike?.origin || ''}${locationLike?.pathname || '/'}`);
  url.searchParams.set('join', token);
  return url.toString();
}
