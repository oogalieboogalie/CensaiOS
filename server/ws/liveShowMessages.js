// server/ws/liveShowMessages.js
//
// Live-show messages on the collaboration socket: the host's camera (which
// spectators follow), audience reactions and raised hands.

import { publishWorkspaceEvent } from '../collaboration/workspaceHub.js';

const MAX_COORDINATE = 1_000_000;
const MAX_ZOOM = 64;
// Reactions are named, not emoji: the UI draws its own icons for them.
export const REACTIONS = Object.freeze(['like', 'love', 'clap', 'question']);

function validCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function notSpectator(entry) {
  return !entry.spectator;
}

export function isMember(entry) {
  return entry.actor?.type !== 'guest';
}

/** Handles camera, reaction and hand; returns false for any other type. */
export function handleLiveShowMessage(message, context, sendJson) {
  const guest = context.actor?.type === 'guest';
  if (message?.type === 'camera') {
    // Only people on the board lead the camera; guests follow it.
    if (guest) {
      sendJson(context.ws, { type: 'error', reason: 'guests-cannot-lead' });
      return true;
    }
    const zoom = Number(message?.zoom);
    if (!validCoordinate(message?.x) || !validCoordinate(message?.y) || !(zoom > 0 && zoom <= MAX_ZOOM)) {
      sendJson(context.ws, { type: 'error', reason: 'invalid-camera' });
      return true;
    }
    const width = Number.isFinite(message?.width) ? Math.min(Math.max(message.width, 1), 20000) : null;
    const height = Number.isFinite(message?.height) ? Math.min(Math.max(message.height, 1), 20000) : null;
    publishWorkspaceEvent(context.workspaceId, {
      type: 'camera', x: message.x, y: message.y, zoom, width, height,
      clientId: context.clientId, actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: (entry) => !isMember(entry) });
    return true;
  }
  if (message?.type === 'reaction') {
    if (!REACTIONS.includes(message?.reaction)) {
      sendJson(context.ws, { type: 'error', reason: 'invalid-reaction' });
      return true;
    }
    publishWorkspaceEvent(context.workspaceId, {
      type: 'reaction', reaction: message.reaction,
      clientId: context.clientId, actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: notSpectator });
    return true;
  }
  if (message?.type === 'hand') {
    publishWorkspaceEvent(context.workspaceId, {
      type: 'hand', raised: Boolean(message?.raised),
      clientId: context.clientId, actor: context.actor,
    }, { filter: isMember });
    return true;
  }
  return false;
}
