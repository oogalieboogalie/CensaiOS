// server/ws/islandMessages.js
//
// Driftholm: each player's browser tells the board where its player stands,
// once a 600 ms tick (game.island), and the board relays it to everyone else
// looking at the board. Ephemeral only; skills, packs and banks travel in the
// shared Yjs doc. Read-only guests never get here (the socket refuses their
// writes), so view links can watch the island.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { ISLAND_MESSAGE, normalizePresence } from '../../src/lib/games/driftholm/wire.js';

// One message a tick is the plan; anything much faster is a broken or
// hostile client and is dropped.
const MIN_GAP_MS = 150;
const lastSent = new Map();

function tooSoon(clientId, now) {
  const last = lastSent.get(clientId) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastSent.set(clientId, now);
  if (lastSent.size > 5000) lastSent.clear();
  return false;
}

// A guest whose link shows one window only hears about that window's island.
function seesWindow(entry, windowId) {
  const link = entry.access?.link;
  if (!link || link.scope_kind !== 'window') return true;
  return String(link.scope_id || '') === windowId;
}

/** Handles game.island; returns false for any other type. */
export function handleIslandMessage(message, context, sendJson, now = Date.now()) {
  if (message?.type !== ISLAND_MESSAGE) return false;
  if (context.spectator) return true;
  const presence = normalizePresence(message);
  if (!presence) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-island' });
    return true;
  }
  if (!presence.gone && tooSoon(context.clientId, now)) return true;
  publishWorkspaceEvent(context.workspaceId, {
    type: ISLAND_MESSAGE, ...presence, clientId: context.clientId, actor: context.actor,
  }, { excludeClientId: context.clientId, guests: true, filter: (entry) => seesWindow(entry, presence.windowId) });
  return true;
}

export function __resetIslandRelayForTests() {
  lastSent.clear();
}
