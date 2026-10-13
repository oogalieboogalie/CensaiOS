// Presence over Yjs awareness: who is on the board, where their cursor is,
// which windows they have selected, which window they are dragging, and
// where they are typing. Pure helpers, no React and no sockets, so the
// mapping is testable on its own.
//
// Each browser tab publishes one local awareness state:
//   { user: { id, name, color }, cursor: { x, y } | null,
//     selection: [windowId], drag: { windowId, x, y } | null,
//     typing: windowId | null }
// Awareness rides the same Hocuspocus connection as the canvas document, so
// presence reaches everyone in the room (and every server process when
// Redis is on), and a closed tab drops out on its own.
import { mergeCollaborationPreviews } from './previews.js';
import { agentOutlines, readAgentPresence } from './agentPresence.js';

const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const MAX_COORDINATE = 1_000_000;

/** Stable colour per person, so the same teammate keeps one colour. */
export function presenceColor(seed) {
  let hash = 0;
  for (const ch of String(seed ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 72% 52%)`;
}

/** The awareness identity for a signed-in user (session.user). */
export function presenceIdentity(user = {}) {
  const id = String(user?.id ?? '').slice(0, 64);
  const emailName = String(user?.email ?? '').split('@')[0];
  const name = String(user?.name || emailName || (id ? `Member ${id}` : 'Someone')).slice(0, 64);
  return { id, name, color: presenceColor(id || name) };
}

function point(value) {
  if (!value || typeof value !== 'object') return null;
  const { x, y } = value;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
  return { x, y };
}

function windowId(value) {
  return ID_PATTERN.test(String(value ?? '')) ? String(value) : null;
}

function actorFor(state, clientId) {
  const user = state?.user || {};
  return {
    type: 'human',
    id: String(user.id || clientId).slice(0, 64),
    label: String(user.name || 'Someone').slice(0, 64),
    color: typeof user.color === 'string' ? user.color.slice(0, 40) : presenceColor(clientId),
  };
}

/**
 * Awareness states (Map clientID -> state) -> the presence buckets the canvas
 * renders. `selfClientId` is left out of everything but the participant list.
 */
export function readAwarenessPresence(states, selfClientId) {
  const participants = [];
  const cursors = {};
  const typing = {};
  const previews = {};
  const selections = {};
  for (const [rawId, state] of states || []) {
    if (!state?.user) continue;
    const clientId = String(rawId);
    const actor = actorFor(state, clientId);
    participants.push({ clientId, actor, self: rawId === selfClientId });
    if (rawId === selfClientId) continue;
    const cursor = point(state.cursor);
    if (cursor) cursors[clientId] = { clientId, ...cursor, actor };
    const typingIn = windowId(state.typing);
    if (typingIn) typing[typingIn] = { windowId: typingIn, actor };
    const dragId = windowId(state.drag?.windowId);
    const dragAt = point(state.drag);
    if (dragId && dragAt) {
      previews[dragId] = { windowId: dragId, ...dragAt, actor: { ...actor, label: `${actor.label} is moving this`, outline: true } };
    }
    for (const id of Array.isArray(state.selection) ? state.selection.slice(0, 50) : []) {
      const selected = windowId(id);
      if (selected && !selections[selected]) selections[selected] = actor;
    }
  }
  return { participants, cursors, typing, previews, selections, agents: readAgentPresence(states) };
}

/**
 * Local windows + remote presence -> what the canvas draws: windows someone
 * else is dragging follow their hand (and carry their colour as a soft lock),
 * windows they selected get their colour outline, typing shows who is in a
 * window without locking it (the text itself merges through the shared doc).
 */
export function applyAwarenessPresence(wins, presence, activeId = null) {
  const merged = mergeCollaborationPreviews(
    wins, presence.previews || {}, { typing: presence.typing || {} }, activeId, { crdt: true },
  );
  // People's selections win over an agent's outline on the same window.
  const selections = { ...agentOutlines(presence.agents), ...(presence.selections || {}) };
  if (!Object.keys(selections).length) return merged;
  return merged.map((win) => {
    const actor = selections[win.id];
    return actor ? { ...win, selectionActor: { ...actor, outline: true } } : win;
  });
}

function guestsOnly(bucket) {
  return Object.fromEntries(Object.entries(bucket || {}).filter(([, entry]) => entry?.actor?.type === 'guest'));
}

/**
 * Members come from awareness; share-link guests and spectators (who may not
 * hold the shared doc) still come from the collaboration socket.
 */
export function mergeGuestPresence(presence, socket = {}) {
  return {
    participants: [
      ...(presence.participants || []),
      ...(socket.participants || []).filter((p) => p?.actor?.type === 'guest'),
    ],
    cursors: { ...guestsOnly(socket.cursors), ...presence.cursors },
    previews: { ...guestsOnly(socket.previews), ...presence.previews },
    typing: { ...guestsOnly(socket.typing), ...presence.typing },
    selections: presence.selections || {},
    agents: presence.agents || {},
  };
}
