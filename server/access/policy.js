// server/access/policy.js
//
// One door for everyone on a board: signed-in people, share-link guests and
// agents. Every place that lets someone act on a board (the Yjs server, the
// collaboration socket, the guest and comment routes, agent replies) asks
// `can()` here instead of deciding on its own. Pure functions, no I/O.
//
// A principal is { kind: 'member' | 'guest' | 'agent', role, ... }:
//   member  role = owner | admin | member | viewer (workspace_members.role)
//   guest   role = view | comment | edit (the share link's role), plus
//           `spectator` for Go live audiences and `scope` for the link scope
//   agent   role = the agent's own level, acting `onBehalfOf` a principal;
//           it gets the lower of the two.

const LEVEL = Object.freeze({ none: 0, view: 1, comment: 2, edit: 3, manage: 4 });

const MEMBER_LEVELS = Object.freeze({ owner: LEVEL.manage, admin: LEVEL.manage, member: LEVEL.edit, viewer: LEVEL.view });
const GUEST_LEVELS = Object.freeze({ view: LEVEL.view, comment: LEVEL.comment, edit: LEVEL.edit });
const AGENT_LEVELS = Object.freeze({ view: LEVEL.view, comment: LEVEL.comment, edit: LEVEL.edit });

// What each action needs. `membersOnly` actions are never open to guests,
// whatever their link says: the owner's keys, vault, memory, other boards,
// terminals and files stay with people who have an account here.
export const ACTIONS = Object.freeze({
  'board.view': { level: LEVEL.view },
  'presence.cursor': { level: LEVEL.view, notSpectator: true },
  'presence.react': { level: LEVEL.view },
  'comment.write': { level: LEVEL.comment },
  'agent.ask': { level: LEVEL.comment },
  'board.edit': { level: LEVEL.edit },
  'board.history': { level: LEVEL.edit, membersOnly: true },
  'links.manage': { level: LEVEL.manage, membersOnly: true },
  'owner.private': { level: LEVEL.edit, membersOnly: true },
});

export function memberPrincipal(role, extra = {}) {
  return Object.freeze({ kind: 'member', role: String(role || ''), ...extra });
}

export function guestPrincipal(link = {}, extra = {}) {
  return Object.freeze({
    kind: 'guest',
    role: String(link.role || 'view'),
    spectator: link.mode === 'live',
    scope: link.scope_kind || link.scopeKind || null,
    ...extra,
  });
}

/** An agent acting for someone never gets more than that someone has. */
export function agentPrincipal(onBehalfOf, { role = 'edit', id = null } = {}) {
  return Object.freeze({ kind: 'agent', role, id, onBehalfOf: onBehalfOf || null });
}

export function levelOf(principal) {
  if (!principal) return LEVEL.none;
  if (principal.kind === 'member') return MEMBER_LEVELS[principal.role] ?? LEVEL.none;
  if (principal.kind === 'guest') return GUEST_LEVELS[principal.role] ?? LEVEL.none;
  if (principal.kind === 'agent') {
    const own = AGENT_LEVELS[principal.role] ?? LEVEL.none;
    return principal.onBehalfOf ? Math.min(own, levelOf(principal.onBehalfOf)) : LEVEL.none;
  }
  return LEVEL.none;
}

function actsAsGuest(principal) {
  if (principal?.kind === 'guest') return true;
  return principal?.kind === 'agent' && actsAsGuest(principal.onBehalfOf);
}

function isSpectator(principal) {
  if (principal?.spectator) return true;
  return principal?.kind === 'agent' && isSpectator(principal.onBehalfOf);
}

/** The one check: may this principal do this action on the board? */
export function can(principal, action) {
  const rule = ACTIONS[action];
  if (!rule) return false;
  if (rule.membersOnly && actsAsGuest(principal)) return false;
  if (rule.notSpectator && isSpectator(principal)) return false;
  return levelOf(principal) >= rule.level;
}

/**
 * How a principal receives the board: the live Yjs replica (read-write or
 * read-only), or a filtered picture sent by the server. A CRDT replica
 * can't be partly shared, so only whole-board edit guests get one.
 */
export function syncMode(principal) {
  if (principal?.kind === 'member') {
    if (!can(principal, 'board.view')) return 'none';
    return can(principal, 'board.edit') ? 'replica' : 'replica-readonly';
  }
  if (principal?.kind === 'guest') {
    if (!can(principal, 'board.view')) return 'none';
    const whole = principal.scope === 'board' && !principal.spectator;
    return whole && can(principal, 'board.edit') ? 'replica' : 'projection';
  }
  return 'none';
}

/** Workspace roles that pass an action, for routes that filter by role. */
export function memberRolesFor(action) {
  return Object.keys(MEMBER_LEVELS).filter((role) => can(memberPrincipal(role), action));
}

// Collaboration socket messages and the action each one needs. Anything not
// listed here changes or reveals live board content, so it needs edit.
const MESSAGE_ACTIONS = Object.freeze({
  'cursor.move': 'presence.cursor',
  reaction: 'presence.react',
  hand: 'presence.react',
});

export function actionForMessage(type) {
  return MESSAGE_ACTIONS[type] || 'board.edit';
}
