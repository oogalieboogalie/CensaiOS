// server/ws/carMessages.js
//
// Draw a track, drive a car: each driver's browser sends where its car is
// (game.car) and the board relays it to everyone else looking at the board.
// Ephemeral only; the track and best laps travel in the shared Yjs doc.
// Read-only guests never get here (the socket refuses their writes), so view
// links watch the race.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { CAR_MESSAGE, normalizeCar } from '../../src/lib/games/racetrack/wire.js';

const MIN_GAP_MS = 25;
const lastSent = new Map();

function tooSoon(clientId, now) {
  const last = lastSent.get(clientId) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastSent.set(clientId, now);
  if (lastSent.size > 5000) lastSent.clear();
  return false;
}

// A guest whose link shows one window only hears about that window's race.
function seesWindow(entry, windowId) {
  const link = entry.access?.link;
  if (!link || link.scope_kind !== 'window') return true;
  return String(link.scope_id || '') === windowId;
}

/** Handles game.car; returns false for any other type. */
export function handleCarMessage(message, context, sendJson, now = Date.now()) {
  if (message?.type !== CAR_MESSAGE) return false;
  if (context.spectator) return true;
  const car = normalizeCar(message);
  if (!car) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-car' });
    return true;
  }
  if (!car.gone && tooSoon(context.clientId, now)) return true;
  publishWorkspaceEvent(context.workspaceId, {
    type: CAR_MESSAGE, ...car, clientId: context.clientId, actor: context.actor,
  }, { excludeClientId: context.clientId, guests: true, filter: (entry) => seesWindow(entry, car.windowId) });
  return true;
}

export function __resetCarRelayForTests() {
  lastSent.clear();
}
