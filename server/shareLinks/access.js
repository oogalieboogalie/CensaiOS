// server/shareLinks/access.js
//
// What a guest link lets someone do, and which parts of the board they may
// see. Pure functions, no I/O: the routes, the collaboration sockets and the
// board projector all ask these instead of re-deciding per call site.

export const SHARE_ROLES = Object.freeze(['view', 'comment', 'edit']);
export const SHARE_SCOPES = Object.freeze(['board', 'group', 'window']);

// Windows that run on, or read from, the owner's machine and accounts.
// They are never sent to a projected guest unless the owner marks the
// window public; edit guests are trusted collaborators and get the board.
export const PRIVATE_WINDOW_KINDS = Object.freeze(new Set([
  'terminal', 'files', 'appearance', 'toolchainSettings', 'windowImporter',
  'mailcow', 'whatsapp', 'githubConsole', 'containers', 'kubernetes',
  'sovereignTest', 'vex', 'linear', 'sheets', 'julesTasks', 'leads',
]));

export function capabilitiesForRole(role) {
  return Object.freeze({
    role,
    canView: SHARE_ROLES.includes(role),
    canComment: role === 'comment' || role === 'edit',
    canEdit: role === 'edit',
  });
}

/**
 * Edit links get the live Yjs document; everything else gets a filtered,
 * throttled picture of the board from the server. Edit is whole-board only
 * because a CRDT replica can't be partially shared.
 */
export function usesProjection(link) {
  return !(link?.role === 'edit' && link?.scope_kind === 'board' && link?.mode !== 'live');
}

function windowKind(win) {
  return String(win?.kind || win?.type || '');
}

function collectGroupIds(rootId, canvasGroups = []) {
  const ids = new Set([String(rootId)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of canvasGroups) {
      const id = String(group?.id ?? '');
      if (!id || ids.has(id)) continue;
      if (group?.groupId && ids.has(String(group.groupId))) {
        ids.add(id);
        grew = true;
      }
    }
  }
  return ids;
}

function visibleWindow(win, link) {
  if (!win || typeof win !== 'object') return false;
  if (win.public === true) return true;
  if (link?.stage) return false;
  return !PRIVATE_WINDOW_KINDS.has(windowKind(win));
}

// Window bodies can hold things a viewer must not get even when the
// window itself is shown (draft keys, local paths); drop the known ones.
const PRIVATE_WINDOW_FIELDS = Object.freeze(['apiKey', 'token', 'secret', 'password', 'credentials', 'localPath', 'projectPath']);

function scrubWindow(win) {
  const out = { ...win };
  for (const field of PRIVATE_WINDOW_FIELDS) delete out[field];
  return out;
}

/**
 * Filter a board snapshot ({ wins, canvasGroups, paths, links }) down to
 * what one share link may see.
 */
export function projectBoardForLink(snapshot = {}, link = {}) {
  const allWins = Array.isArray(snapshot.wins) ? snapshot.wins : [];
  const allGroups = Array.isArray(snapshot.canvasGroups) ? snapshot.canvasGroups : [];
  let wins = allWins;
  let canvasGroups = allGroups;
  const scopeKind = link.scope_kind || 'board';
  if (scopeKind === 'window') {
    wins = allWins.filter((win) => String(win?.id) === String(link.scope_id));
    canvasGroups = [];
  } else if (scopeKind === 'group') {
    const groupIds = collectGroupIds(link.scope_id, allGroups);
    wins = allWins.filter((win) => win?.groupId && groupIds.has(String(win.groupId)));
    canvasGroups = allGroups.filter((group) => groupIds.has(String(group?.id)));
  }
  const shown = wins.filter((win) => visibleWindow(win, link)).map(scrubWindow);
  const shownIds = new Set(shown.map((win) => String(win.id)));
  const links = (Array.isArray(snapshot.links) ? snapshot.links : [])
    .filter((edge) => shownIds.has(String(edge?.fromId)) && shownIds.has(String(edge?.toId)));
  return {
    wins: shown,
    canvasGroups,
    // Ink is board-wide, so it only travels with whole-board, non-stage links.
    paths: scopeKind === 'board' && !link.stage && Array.isArray(snapshot.paths) ? snapshot.paths : [],
    links,
  };
}

/** Comments a link may see: whole-board links see all, scoped ones only theirs. */
export function commentVisibleToLink(comment, link, visibleWindowIds) {
  if (!link) return true;
  if ((link.scope_kind || 'board') === 'board' && !link.stage) return true;
  return Boolean(comment?.window_id && visibleWindowIds.has(String(comment.window_id)));
}
