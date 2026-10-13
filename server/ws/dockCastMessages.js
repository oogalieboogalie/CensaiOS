// server/ws/dockCastMessages.js
//
// Dock app windows: the person docking a real app on their desktop sends
// small pictures of it, and everyone else on the board sees them in that
// window. VM windows reuse it for pictures of the VM screen. Ephemeral relay
// only; who is docking what lives in the shared doc.
//
//   dock.cast  host -> other members   { windowId, frame | null, width, height }
//
// Pictures go to members of the workspace, not to guests: a docked app is
// someone's own desktop app, so share links don't carry it.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';
import { CAST_TYPE, normalizeCast } from '../../src/lib/dock/wire.js';
import { isMember } from './liveShowMessages.js';

// Hosts send about two pictures a second; anything faster is dropped.
const MIN_GAP_MS = 200;
const lastSent = new Map();

function tooSoon(key, now) {
  const last = lastSent.get(key) || 0;
  if (now - last < MIN_GAP_MS) return true;
  lastSent.set(key, now);
  if (lastSent.size > 5000) lastSent.clear();
  return false;
}

/** Handles dock.cast; returns false for any other type. */
export function handleDockCastMessage(message, context, sendJson, now = Date.now()) {
  if (message?.type !== CAST_TYPE) return false;
  if (context.spectator || context.actor?.type === 'guest') return true;
  const cast = normalizeCast(message);
  if (!cast) {
    sendJson(context.ws, { type: 'error', reason: 'invalid-dock-cast' });
    return true;
  }
  // A stop must never be dropped.
  if (cast.frame && tooSoon(`${context.clientId}:${cast.windowId}`, now)) return true;
  publishWorkspaceEvent(context.workspaceId, {
    type: CAST_TYPE, ...cast, clientId: context.clientId, actor: context.actor,
  }, { excludeClientId: context.clientId, filter: isMember });
  return true;
}

export function __resetDockCastRelayForTests() {
  lastSent.clear();
}
