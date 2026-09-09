// server/ws/agentRegistry.js
//
// WebSocket endpoint for A2A-style task delegation. Mounted at
// /ws/agent-registry by attachAgentRegistryWs(server). Follows the
// noServer pattern from server/terminal/sessions.js so a single HTTP
// server can host multiple WS upgrades.
//
// Auth: the upgrade handler resolves the actor from the connect.sid
// cookie via the same Postgres session store the REST API uses
// (Store#get contract: async (sid, cb) -> sess|null). Tests inject
// an `authenticate` stub via `opts`.
//
// Protocol (server -> client): ready, subscribed, unsubscribed,
// call.started, call.event, call.complete, call.failed, error, ping.
// Protocol (client -> server): subscribe, unsubscribe, call, pong.
// Heartbeat: pings every HEARTBEAT_MS; close 4001 after HEARTBEAT_GRACE_MS.

import { WebSocketServer } from 'ws';
import { subscribe, unsubscribe } from './registryHub.js';
import { getAgentCard } from '../agent-registry/factories.js';
import {
  actorId,
  normalizeClientTaskId,
} from '../agent-card-runs/contract.js';
import { createAgentCardRun } from '../agent-card-runs/store.js';
import { agentCardActorChannel } from '../agent-card-runs/events.js';
import { createLogger } from '../logger.js';
import {
  canActorInvokeCard,
} from '../agent-registry/access.js';
import { prepareAgentCardCall } from '../agent-registry/callScope.js';
import { decodeSessionCookie } from './sessionCookie.js';
import { isSessionAuthorized } from '../security/authPolicy.js';

const log = createLogger('agent-registry-ws');

export const WS_PATH = '/ws/agent-registry';
const HEARTBEAT_MS = 30_000;
const HEARTBEAT_GRACE_MS = HEARTBEAT_MS * 3;
const MAX_MESSAGE_BYTES = 256 * 1024;

function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) return false;
  try { ws.send(JSON.stringify(payload)); return true; }
  catch (err) { log.warn('send failed', { error: err.message }); return false; }
}

function parseCookieSid(req) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== 'connect.sid') continue;
    const v = part.slice(1 + idx).trim();
    return v ? decodeURIComponent(v) : null;
  }
  return null;
}

/** Default upgrade-time authenticator: connect.sid cookie -> session store. */
export async function defaultAuthenticate(req, options = {}) {
  const { sessionStore, sessionSecret = process.env.SESSION_SECRET } = options;
  if (!sessionStore || typeof sessionStore.get !== 'function') return null;
  const sid = decodeSessionCookie(parseCookieSid(req), sessionSecret);
  if (!sid) return null;
  const sess = await new Promise((resolve, reject) => {
    try {
      sessionStore.get(sid, (err, value) => err ? reject(err) : resolve(value || null));
    } catch (err) { reject(err); }
  });
  if (!sess || !isSessionAuthorized(sess, options)) return null;
  return {
    userId: String(sess.userId),
    ...(sess.userRole ? { userRole: sess.userRole } : {}),
    ...(sess.userEmail ? { userEmail: sess.userEmail } : {}),
  };
}

/**
 * Attach the agent-registry WS endpoint to `server` (an http.Server).
 * `opts.authenticate` overrides the default session-cookie auth
 * (tests pass a stub); `opts.sessionStore` is required otherwise.
 */
export function attachAgentRegistryWs(server, opts = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  const authenticate = opts.authenticate || ((req) => defaultAuthenticate(req, opts));

  server.on('upgrade', (request, socket, head) => {
    let requestUrl;
    try { requestUrl = new URL(request.url || '/', 'http://localhost'); }
    catch { socket.destroy(); return; }
    // This server hosts several noServer WebSocket endpoints. An endpoint
    // handler must leave upgrades it does not own untouched so the matching
    // handler can claim them.
    if (requestUrl.pathname !== WS_PATH) return;
    authenticate(request).then((actor) => {
      if (!actor || !actor.userId) {
        log.info('rejecting unauthenticated upgrade');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const userId = actorId(actor);
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { kind: 'user', id: userId });
      });
    }).catch((err) => {
      log.error('upgrade auth failed', { error: err.message });
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    });
  });

  wss.on('connection', (ws, _request, actor) => {
    const subscriptions = new Set();
    let lastPongAt = Date.now();
    let isAlive = true;

    const beat = () => {
      if (!isAlive || Date.now() - lastPongAt > HEARTBEAT_GRACE_MS) {
        log.info('heartbeat-timeout, closing', { userId: actor.id });
        try { ws.close(4001, 'heartbeat-timeout'); } catch { /* already closing */ }
        return;
      }
      isAlive = false;
      safeSend(ws, { type: 'ping', ts: Date.now() });
    };
    const heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
    ws.once('close', () => clearInterval(heartbeatTimer));

    safeSend(ws, { type: 'ready', userId: actor.id });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); }
      catch { safeSend(ws, { type: 'error', reason: 'invalid-json' }); return; }
      if (!msg || typeof msg !== 'object') {
        safeSend(ws, { type: 'error', reason: 'invalid-message' });
        return;
      }
      handleClientMessage(ws, msg, actor, subscriptions).catch((err) => {
        log.warn('handler error', { type: msg.type, error: err.message });
        safeSend(ws, { type: 'error', reason: err.message || 'internal-error' });
      });
    });

    ws.on('pong', () => { lastPongAt = Date.now(); isAlive = true; });

    ws.on('close', () => {
      for (const key of subscriptions) {
        const idx = key.indexOf('\u0000');
        if (idx < 0) continue;
        unsubscribe(key.slice(0, idx), key.slice(1 + idx));
      }
      subscriptions.clear();
    });

    ws.on('error', (err) => log.warn('socket error', { userId: actor.id, error: err.message }));
  });

  return wss;
}

/** Per-message handler — exported so tests can drive it with a fake `ws`. */
export async function handleClientMessage(ws, msg, actor, subscriptions) {
  switch (msg.type) {
    case 'subscribe': {
      const { cardId, clientId } = msg;
      if (typeof cardId !== 'string' || !cardId) return safeSend(ws, { type: 'error', reason: 'subscribe:cardId-required' });
      if (typeof clientId !== 'string' || !clientId) return safeSend(ws, { type: 'error', reason: 'subscribe:clientId-required' });
      const card = await getAgentCard(cardId);
      if (!card || !(await canActorInvokeCard(card, actor))) {
        return safeSend(ws, { type: 'error', reason: 'subscribe:not-allowed' });
      }
      const channel = agentCardActorChannel(cardId, actorId(actor));
      subscribe(channel, clientId, (event) => safeSend(ws, event));
      subscriptions.add(`${channel}\u0000${clientId}`);
      return safeSend(ws, { type: 'subscribed', cardId, clientId });
    }
    case 'unsubscribe': {
      const { cardId, clientId } = msg;
      if (typeof cardId !== 'string' || typeof clientId !== 'string') return safeSend(ws, { type: 'error', reason: 'unsubscribe:bad-args' });
      const channel = agentCardActorChannel(cardId, actorId(actor));
      unsubscribe(channel, clientId);
      subscriptions.delete(`${channel}\u0000${clientId}`);
      return safeSend(ws, { type: 'unsubscribed', cardId, clientId });
    }
    case 'call': {
      const { cardId, payload, options } = msg;
      if (typeof cardId !== 'string' || !cardId) return safeSend(ws, { type: 'error', reason: 'call:cardId-required' });
      const card = await getAgentCard(cardId);
      if (!card) return safeSend(ws, { type: 'call.failed', taskId: msg.taskId, error: 'card-not-found' });
      if (!(await canActorInvokeCard(card, actor))) {
        return safeSend(ws, { type: 'call.failed', taskId: msg.taskId, error: 'not-allowed' });
      }
      let temporarySubscription = null;
      try {
        const call = await prepareAgentCardCall({ card, actor, payload, options });
        const taskId = normalizeClientTaskId(msg.taskId);
        const channel = agentCardActorChannel(cardId, actorId(actor));
        const alreadySubscribed = [...subscriptions].some((key) => key.startsWith(`${channel}\u0000`));
        if (!alreadySubscribed) {
          const clientId = `call:${taskId}`;
          const key = `${channel}\u0000${clientId}`;
          subscribe(channel, clientId, (event) => {
            safeSend(ws, event);
            if (event.type === 'call.complete' || event.type === 'call.failed') {
              unsubscribe(channel, clientId);
              subscriptions.delete(key);
            }
          });
          subscriptions.add(key);
          temporarySubscription = { channel, clientId, key };
        }
        const queued = await createAgentCardRun({
          ...call,
          clientTaskId: taskId,
        });
        return safeSend(ws, {
          type: 'call.started', cardId, taskId, runId: queued.runId, status: queued.status,
        });
      } catch (error) {
        if (temporarySubscription) {
          unsubscribe(temporarySubscription.channel, temporarySubscription.clientId);
          subscriptions.delete(temporarySubscription.key);
        }
        return safeSend(ws, { type: 'call.failed', cardId, taskId: msg.taskId, error: error.code || error.message });
      }
    }
    case 'pong':
      return undefined;
    default:
      return safeSend(ws, { type: 'error', reason: `unknown-type:${msg.type}` });
  }
}
