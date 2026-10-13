// server/ws/gameMessages.js
//
// Games on the board (spec 11). One person's browser runs the match (the
// host); the others send it their keys and get pictures of the match back.
// Both are ephemeral relays on the collaboration socket: the lasting parts
// (who is hosting, the high-score table) travel in the shared Yjs doc.
//
//   game.input  player -> host only      keys, join, leave
//   game.frame  host   -> everyone else  a picture of the match
//
// Read-only guests never get here (the socket refuses their writes), so
// view and comment links can watch a match but not play in it.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { decodeFrame, normalizeGameInput, relayFrame } from '../../src/lib/games/asteroids/wire.js';
import { handleCarMessage } from './carMessages.js';
import { handleIslandMessage } from './islandMessages.js';

// Floor between two messages of the same kind from one browser. A host sends
// about 30 frames a second and players send keys as they change.
const MIN_GAP_MS = 12;
const lastSent = new Map();

function tooSoon(clientId, type, now) {
  const key = `${clientId}:${type}`;
  const last = lastSent.get(key) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastSent.set(key, now);
  if (lastSent.size > 5000) lastSent.clear();
  return false;
}

// A guest whose link shows one window only hears about that window's game.
function seesWindow(entry, windowId) {
  const link = entry.access?.link;
  if (!link || link.scope_kind !== 'window') return true;
  return String(link.scope_id || '') === windowId;
}

/** Handles game.input, game.frame, game.car and game.island; returns false for any other type. */
export function handleGameMessage(message, context, sendJson, now = Date.now()) {
  if (handleCarMessage(message, context, sendJson, now)) return true;
  if (handleIslandMessage(message, context, sendJson, now)) return true;
  if (message?.type !== 'game.input' && message?.type !== 'game.frame') return false;
  if (context.spectator) return true;
  if (message.type === 'game.input') {
    const input = normalizeGameInput(message);
    if (!input) {
      sendJson(context.ws, { type: 'error', reason: 'invalid-game-input' });
      return true;
    }
    // Players resend their keys a few times a second, so a dropped one is
    // corrected quickly; a leave must never be dropped.
    if (!input.leave && tooSoon(context.clientId, message.type, now)) return true;
    publishWorkspaceEvent(context.workspaceId, {
      type: 'game.input', ...input, clientId: context.clientId, actor: context.actor,
    }, { guests: true, filter: (entry) => entry.clientId === input.to && entry.clientId !== context.clientId });
    return true;
  }
  const picture = decodeFrame(message);
  if (!picture) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-game-frame' });
    return true;
  }
  if (picture.status === 'playing' && tooSoon(context.clientId, message.type, now)) return true;
  publishWorkspaceEvent(context.workspaceId, {
    type: 'game.frame', ...relayFrame(picture), clientId: context.clientId, actor: context.actor,
  }, { excludeClientId: context.clientId, guests: true, filter: (entry) => seesWindow(entry, picture.windowId) });
  return true;
}

export function __resetGameRelayForTests() {
  lastSent.clear();
}
