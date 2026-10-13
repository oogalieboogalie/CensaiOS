// server/collab/hocuspocus.js
//
// Phase 1 skeleton: self-hosted Hocuspocus (Yjs) collaboration endpoint.
//
// Connection gating mirrors server/ws/workspaceCollaboration.js:116-130:
// the upgrade handler resolves the session cookie through defaultAuthenticate
// (same sessionStore pattern) and reuses requireWorkspaceMember — neither is
// copied here. Viewer role -> read-only Hocuspocus connection (writes
// rejected, awareness still allowed); non-member -> 401/403 HTTP rejection.
//
// Persistence + snapshot seeding ride along as a mounted extension
// (server/collab/yPersistence.js); the client binding lands in a later phase.
// This skeleton only gates connections and tags read-only access.

import { WebSocketServer } from 'ws';
import { Hocuspocus } from '@hocuspocus/server';
import { Redis } from '@hocuspocus/extension-redis';
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { defaultAuthenticate, loadSessionFromRequest } from '../ws/agentRegistry.js';
import { resolveGuestSession } from '../shareLinks/guestSession.js';
import { guestPrincipal, memberPrincipal, syncMode } from '../access/policy.js';
import { trackGuestSocket } from '../shareLinks/liveGuests.js';
import { createYjsPersistence } from './yPersistence.js';
import { registerLiveHocuspocus } from './liveDoc.js';

export const HOCUSPOCUS_PATH = '/hocuspocus';

// Mirrors workspaceCollaboration.js ID_PATTERN for workspaceId validation.
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,96}$/;

const log = createLogger('hocuspocus');

function rejectUpgrade(socket, statusCode, reason) {
  socket.write(`HTTP/1.1 ${statusCode} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/** Viewers may observe + send awareness, but never write document updates. */
export function readOnlyForRole(role) {
  return syncMode(memberPrincipal(role)) !== 'replica';
}

/**
 * Apply the membership-derived access level to a Hocuspocus connection.
 * Exported so tests can assert the read-only mapping without driving the
 * full hook runner (which logs hook rejections to console.error).
 */
export function applyConnectionAccess(context, connectionConfig) {
  if (!context?.workspace) throw new Error('hocuspocus: missing workspace context');
  connectionConfig.readOnly = context.readOnly ?? readOnlyForRole(context.workspace.role);
  return connectionConfig.readOnly;
}

/**
 * Membership is checked against the `workspaceId` query param at upgrade
 * time, so the Yjs document a socket opens must be that same workspace —
 * otherwise a member of one workspace could open another's document by name.
 */
export function assertDocumentInWorkspace(context, documentName) {
  if (String(documentName ?? '') !== String(context?.workspace?.id ?? '')) {
    throw new Error('hocuspocus: document does not belong to the authorized workspace');
  }
}

/**
 * Redis lets several server processes share one live room (pub/sub of
 * updates and presence). Set REDIS_URL to turn it on; without it a single
 * process holds rooms in memory, which is all one machine needs. Durable
 * storage is always the Postgres update log, never Redis.
 */
export function redisConfigFromEnv(env = process.env) {
  const raw = String(env.REDIS_URL || '').trim();
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!/^rediss?:$/.test(url.protocol)) return null;
  const dbIndex = Number(url.pathname.replace(/^\//, '') || 0);
  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || 6379),
    prefix: String(env.REDIS_PREFIX || 'censai-canvas'),
    options: {
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(Number.isInteger(dbIndex) && dbIndex > 0 ? { db: dbIndex } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    },
  };
}

export function createHocuspocusServer(options = {}) {
  // Postgres persistence (update log + snapshot migration + backup copy) is
  // mounted as an extension. No I/O happens here: hooks only fire once a
  // client opens a document.
  const persistence = options.persistence ?? createYjsPersistence({ db: options.db ?? pool });
  const redis = options.redis === undefined ? redisConfigFromEnv() : options.redis;
  const extensions = [persistence];
  if (redis) {
    extensions.push(new Redis(redis));
    log.info('hocuspocus rooms shared through redis', { host: redis.host, port: redis.port });
  }
  return new Hocuspocus({
    ...(options.config || {}),
    extensions,
    async onConnect({ context, connectionConfig, documentName }) {
      assertDocumentInWorkspace(context, documentName);
      applyConnectionAccess(context, connectionConfig);
      log.info('hocuspocus client connected', {
        workspaceId: context.workspace.id ?? documentName,
        role: context.workspace.role,
        readOnly: connectionConfig.readOnly,
      });
    },
    async onDisconnect({ context, documentName }) {
      log.info('hocuspocus client disconnected', {
        workspaceId: context?.workspace?.id ?? documentName,
        role: context?.workspace?.role,
      });
    },
  });
}

export function attachHocuspocusWs(server, options = {}) {
  const wss = new WebSocketServer({ noServer: true });
  const db = options.db || pool;
  const authenticate = options.authenticate || ((request) => defaultAuthenticate(request, options));
  const hocuspocus = options.hocuspocus || createHocuspocusServer({ db });
  // Lets server-side writers (agents) edit the live canvas doc.
  if (!options.hocuspocus) registerLiveHocuspocus(hocuspocus);
  const authenticateGuest = options.authenticateGuest || (async (request, workspaceId) => {
    const sess = await loadSessionFromRequest(request, options);
    return resolveGuestSession(db, sess, { workspaceId });
  });

  function connectClient(ws, request, context, onClose = null) {
    const client = hocuspocus.handleConnection(ws, request, context);
    // Hocuspocus v4 leaves socket I/O to the host: route frames and close
    // events into the client connection, or no sync message is ever read.
    ws.on('message', (data, isBinary) => {
      if (!isBinary) return;
      client?.handleMessage?.(new Uint8Array(Array.isArray(data) ? Buffer.concat(data) : data));
    });
    ws.on('close', (code, reason) => {
      onClose?.();
      client?.handleClose?.({ code, reason: String(reason || '') });
    });
  }

  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return;
    }
    if (url.pathname !== HOCUSPOCUS_PATH) return;
    const workspaceId = String(url.searchParams.get('workspaceId') || '').trim();
    if (!ID_PATTERN.test(workspaceId)) return rejectUpgrade(socket, 400, 'Bad Request');

    // Only edit links get the CRDT replica; view and comment guests are
    // served a filtered board over the collaboration socket instead.
    if (url.searchParams.get('guest') === '1') {
      Promise.resolve(authenticateGuest(request, workspaceId)).then((guestAccess) => {
        if (syncMode(guestPrincipal(guestAccess.link)) !== 'replica') return rejectUpgrade(socket, 403, 'Forbidden');
        wss.handleUpgrade(request, socket, head, (ws) => {
          const untrack = trackGuestSocket(guestAccess.link.id, (code, reason) => ws.close(code, reason), {
            expiresAt: guestAccess.link.expires_at,
          });
          connectClient(ws, request, {
            userId: null,
            guestId: guestAccess.actor.id,
            workspace: guestAccess.workspace,
            readOnly: false,
          }, untrack);
        });
        return undefined;
      }).catch((error) => {
        log.warn('hocuspocus guest upgrade rejected', { workspaceId, status: error.statusCode || 500 });
        const status = error.statusCode === 401 ? 401 : (error.statusCode === 403 || error.statusCode === 410 ? 403 : 500);
        rejectUpgrade(socket, status, status === 401 ? 'Unauthorized' : (status === 403 ? 'Forbidden' : 'Internal Server Error'));
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
        connectClient(ws, request, {
          userId: session.userId,
          workspace,
          readOnly: readOnlyForRole(workspace.role),
        });
      });
    }).catch((error) => {
      log.warn('hocuspocus upgrade rejected', { workspaceId, status: error.statusCode || 500 });
      rejectUpgrade(socket, error.statusCode === 403 ? 403 : 500,
        error.statusCode === 403 ? 'Forbidden' : 'Internal Server Error');
    });
  });

  return wss;
}
