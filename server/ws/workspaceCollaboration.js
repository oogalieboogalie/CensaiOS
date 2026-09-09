import { WebSocket, WebSocketServer } from 'ws';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { defaultAuthenticate } from './agentRegistry.js';
import { collaborationHumanActor } from '../collaboration/humanActor.js';
import {
  joinWorkspaceClient,
  leaveWorkspaceClient,
  listWorkspaceParticipants,
  publishPresence,
  publishWorkspaceEvent,
} from '../collaboration/workspaceHub.js';

export const WORKSPACE_COLLABORATION_PATH = '/ws/workspace-collaboration';

const MAX_COORDINATE = 1_000_000;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;
const MAX_TEXT_PREVIEW_BYTES = 8 * 1024;
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

export function handleWorkspaceCollaborationMessage(message, context) {
  if (message?.type === 'window.preview') {
    const preview = normalizeWindowPreview(message);
    if (!preview) return sendJson(context.ws, { type: 'error', reason: 'invalid-window-preview' });
    publishWorkspaceEvent(context.workspaceId, {
      type: 'window.preview',
      ...preview,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId });
    return undefined;
  }
  if (message?.type === 'cursor.move') {
    if (!validCoordinate(message?.x) || !validCoordinate(message?.y)) {
      return sendJson(context.ws, { type: 'error', reason: 'invalid-cursor' });
    }
    publishWorkspaceEvent(context.workspaceId, {
      type: 'cursor.move',
      x: message.x, y: message.y,
      clientId: context.clientId,
      actor: context.actor,
    }, { excludeClientId: context.clientId });
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
    }, { excludeClientId: context.clientId });
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
    }, { excludeClientId: context.clientId });
    return undefined;
  }
  return sendJson(context.ws, { type: 'error', reason: `unknown-type:${message?.type}` });
}

export function attachWorkspaceCollaborationWs(server, options = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const db = options.db || pool;
  const authenticate = options.authenticate || ((request) => defaultAuthenticate(request, options));

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== WORKSPACE_COLLABORATION_PATH) return;
    const workspaceId = String(url.searchParams.get('workspaceId') || '').trim();
    const clientId = String(url.searchParams.get('clientId') || '').trim();
    if (!ID_PATTERN.test(workspaceId) || !ID_PATTERN.test(clientId)) {
      return rejectUpgrade(socket, 400, 'Bad Request');
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
  });

  wss.on('connection', (ws, _request, { workspace, session, clientId }) => {
    const workspaceId = workspace.id;
    const actor = collaborationHumanActor(session);
    const send = (event) => sendJson(ws, event);
    try {
      joinWorkspaceClient({ workspaceId, clientId, actor, send });
    } catch (error) {
      sendJson(ws, { type: 'error', reason: error.code || 'collaboration_capacity' });
      ws.close(1013, 'Workspace full');
      return;
    }
    sendJson(ws, {
      type: 'collaboration.ready', workspaceId, clientId, actor,
      participants: listWorkspaceParticipants(workspaceId),
    });
    publishPresence(workspaceId);

    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); }
      catch { return sendJson(ws, { type: 'error', reason: 'invalid-json' }); }
      return handleWorkspaceCollaborationMessage(message, {
        ws, workspaceId, clientId, actor,
      });
    });
    ws.on('close', () => {
      if (leaveWorkspaceClient(workspaceId, clientId, send)) publishPresence(workspaceId);
    });
    ws.on('error', () => undefined);
  });

  return wss;
}
