import { WebSocket, WebSocketServer } from 'ws';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { defaultAuthenticate, loadSessionFromRequest } from './agentRegistry.js';
import { collaborationHumanActor } from '../collaboration/humanActor.js';
import {
  countWorkspaceSpectators,
  joinWorkspaceClient,
  leaveWorkspaceClient,
  listWorkspaceParticipants,
  publishPresence,
  publishWorkspaceEvent,
} from '../collaboration/workspaceHub.js';
import { resolveGuestSession } from '../shareLinks/guestSession.js';
import { trackGuestSocket } from '../shareLinks/liveGuests.js';
import { usesProjection } from '../shareLinks/access.js';
import { subscribeProjection } from '../shareLinks/projector.js';
import { isMember, handleLiveShowMessage, notSpectator } from './liveShowMessages.js';
import { handleInkPreviewMessage } from './inkPreviewMessages.js';

export { REACTIONS } from './liveShowMessages.js';

export const WORKSPACE_COLLABORATION_PATH = '/ws/workspace-collaboration';

const MAX_COORDINATE = 1_000_000;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const MAX_TEXT_PREVIEW_BYTES = 8 * 1024;
// Guests who can't edit may only send presence-style messages.
const READ_ONLY_GUEST_TYPES = new Set(['cursor.move', 'reaction', 'hand']);
const log = createLogger('workspace-collaboration');

function sendJson(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

function rejectUpgrade(socket, statusCode, reason) {
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function validCoordinate(value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

export function normalizeWindowPreview(message) {
  if (!ID_PATTERN.test(String(message?.windowId || ''))) return null;
  if (!validCoordinate(message?.x) || !validCoordinate(message?.y)) return null;
  const phase = message?.phase === 'end' ? 'end' : 'move';
  const sequence = Number.isSafeInteger(message?.sequence) && message.sequence >= 0
    ? message.sequence : 0;
  return { windowId: message.windowId, x: message.x, y: message.y, phase, sequence };
}

// Live drags and keystrokes carry window content, so only people who hold
// the whole board (members and edit guests) receive them.
function seesLiveEdits(entry) {
  return isMember(entry) || entry.actor?.role === 'edit';
}

export function handleWorkspaceCollaborationMessage(message, context) {
  const guest = context.actor?.type === 'guest';
  if (guest && !context.canEdit && !READ_ONLY_GUEST_TYPES.has(message?.type)) {
    return sendJson(context.ws, { type: 'error', reason: 'read-only-guest' });
  }
  if (handleLiveShowMessage(message, context, sendJson)) return undefined;
  if (handleInkPreviewMessage(message, context, sendJson)) return undefined;
  if (message?.type === 'window.preview') {
    const preview = normalizeWindowPreview(message);
    if (!preview) return sendJson(context.ws, { type: 'error', reason: 'invalid-window-preview' });
    publishWorkspaceEvent(context.workspaceId, {
      type: 'window.preview',
      ...preview,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: seesLiveEdits });
    return undefined;
  }
  if (message?.type === 'cursor.move') {
    if (!validCoordinate(message?.x) || !validCoordinate(message?.y)) {
      return sendJson(context.ws, { type: 'error', reason: 'invalid-cursor' });
    }
    if (context.spectator) return undefined;
    publishWorkspaceEvent(context.workspaceId, {
      type: 'cursor.move',
      x: message.x, y: message.y,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: notSpectator });
    return undefined;
  }
  if (message?.type === 'typing') {
    if (!ID_PATTERN.test(String(message?.windowId || ''))) {
      return sendJson(context.ws, { type: 'error', reason: 'invalid-typing-target' });
    }
    publishWorkspaceEvent(context.workspaceId, {
      type: 'typing',
      windowId: message.windowId,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: seesLiveEdits });
    return undefined;
  }
  if (message?.type === 'text.preview') {
    if (!ID_PATTERN.test(String(message?.windowId || ''))) {
      return sendJson(context.ws, { type: 'error', reason: 'invalid-text-target' });
    }
    const text = String(message?.text || '');
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_PREVIEW_BYTES) {
      return sendJson(context.ws, { type: 'error', reason: 'text-preview-too-large' });
    }
    publishWorkspaceEvent(context.workspaceId, {
      type: 'text.preview',
      windowId: message.windowId,
      text,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId, guests: true, filter: seesLiveEdits });
    return undefined;
  }
  return sendJson(context.ws, { type: 'error', reason: `unknown-type:${message?.type}` });
}

async function defaultAuthenticateGuest(request, db, workspaceId, options) {
  const sess = await loadSessionFromRequest(request, options);
  return resolveGuestSession(db, sess, { workspaceId });
}

function upgradeStatus(error) {
  if (error.statusCode === 401) return [401, 'Unauthorized'];
  if (error.statusCode === 403 || error.statusCode === 410) return [403, 'Forbidden'];
  return [500, 'Internal Server Error'];
}

export function attachWorkspaceCollaborationWs(server, options = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const db = options.db || pool;
  const authenticate = options.authenticate || ((request) => defaultAuthenticate(request, options));
  const authenticateGuest = options.authenticateGuest
    || ((request, workspaceId) => defaultAuthenticateGuest(request, db, workspaceId, options));

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== WORKSPACE_COLLABORATION_PATH) return;
    const workspaceId = String(url.searchParams.get('workspaceId') || '').trim();
    const clientId = String(url.searchParams.get('clientId') || '').trim();
    if (!ID_PATTERN.test(workspaceId) || !ID_PATTERN.test(clientId)) {
      return rejectUpgrade(socket, 400, 'Bad Request');
    }

    // A browser holding a guest pass asks for the guest channel explicitly,
    // so a signed-in person opening a share link is still handled as a guest.
    if (url.searchParams.get('guest') === '1') {
      Promise.resolve(authenticateGuest(request, workspaceId)).then((guestAccess) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, { workspace: guestAccess.workspace, guestAccess, clientId });
        });
      }).catch((error) => {
        log.warn('guest collaboration upgrade rejected', { workspaceId, status: error.statusCode || 500 });
        const [status, reason] = upgradeStatus(error);
        rejectUpgrade(socket, status, reason);
      });
      return undefined;
    }

    Promise.resolve(authenticate(request)).then(async (session) => {
      if (!session?.userId) return rejectUpgrade(socket, 401, 'Unauthorized');
      const workspace = await requireWorkspaceMember(db, {
        userId: session.userId,
        workspaceId,
      });
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { workspace, session, clientId });
      });
    }).catch((error) => {
      log.warn('collaboration upgrade rejected', { workspaceId, status: error.statusCode || 500 });
      rejectUpgrade(socket, error.statusCode === 403 ? 403 : 500,
        error.statusCode === 403 ? 'Forbidden' : 'Internal Server Error');
    });
    return undefined;
  });

  wss.on('connection', (ws, _request, { workspace, session, clientId, guestAccess = null }) => {
    const workspaceId = workspace.id;
    const actor = guestAccess ? guestAccess.actor : collaborationHumanActor(session);
    const spectator = Boolean(guestAccess?.actor?.spectator);
    const send = (event) => sendJson(ws, event);
    try {
      joinWorkspaceClient({
        workspaceId, clientId, actor, send, spectator,
        access: guestAccess ? { link: guestAccess.link } : null,
      });
    } catch (error) {
      sendJson(ws, { type: 'error', reason: error.code || 'collaboration_capacity' });
      ws.close(1013, 'Workspace full');
      return;
    }
    const cleanups = [];
    if (guestAccess) {
      cleanups.push(trackGuestSocket(guestAccess.link.id, (code, reason) => ws.close(code, reason), {
        expiresAt: guestAccess.link.expires_at,
      }));
    }
    sendJson(ws, {
      type: 'collaboration.ready', workspaceId, clientId, actor,
      participants: listWorkspaceParticipants(workspaceId),
      spectators: countWorkspaceSpectators(workspaceId),
      ...(guestAccess ? {
        guest: {
          role: guestAccess.link.role,
          capabilities: guestAccess.capabilities,
          live: guestAccess.link.mode === 'live',
          projected: usesProjection(guestAccess.link),
        },
      } : {}),
    });
    publishPresence(workspaceId);
    if (guestAccess && usesProjection(guestAccess.link)) {
      subscribeProjection({ workspaceId, clientId, link: guestAccess.link, send })
        .then((unsubscribe) => {
          if (ws.readyState === WebSocket.OPEN) cleanups.push(unsubscribe);
          else unsubscribe();
        })
        .catch((error) => log.warn('guest board projection failed', { workspaceId, error: error.message }));
    }

    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); }
      catch { return sendJson(ws, { type: 'error', reason: 'invalid-json' }); }
      return handleWorkspaceCollaborationMessage(message, {
        ws, workspaceId, clientId, actor, spectator,
        canEdit: guestAccess ? guestAccess.capabilities.canEdit : true,
      });
    });
    ws.on('close', () => {
      for (const cleanup of cleanups.splice(0)) cleanup();
      if (leaveWorkspaceClient(workspaceId, clientId, send)) publishPresence(workspaceId);
    });
    ws.on('error', () => undefined);
  });

  return wss;
}
