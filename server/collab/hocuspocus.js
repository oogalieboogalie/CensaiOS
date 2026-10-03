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
import pool from '../db.js';
import { createLogger } from '../logger.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { defaultAuthenticate } from '../ws/agentRegistry.js';
import { createYjsPersistence } from './yPersistence.js';

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
  return role === 'viewer';
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

export function createHocuspocusServer(options = {}) {
  // Phase 2: Postgres persistence mounted as an extension (load-or-seed on
  // onLoadDocument, debounced save on onStoreDocument). No I/O happens here —
  // hooks only fire once a client opens a document.
  const persistence = options.persistence ?? createYjsPersistence({ db: options.db ?? pool });
  return new Hocuspocus({
    extensions: [persistence],
    async onConnect({ context, connectionConfig, documentName }) {
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

    Promise.resolve(authenticate(request)).then(async (session) => {
      if (!session?.userId) return rejectUpgrade(socket, 401, 'Unauthorized');
      const workspace = await requireWorkspaceMember(db, {
        userId: session.userId,
        workspaceId,
      });
      wss.handleUpgrade(request, socket, head, (ws) => {
        hocuspocus.handleConnection(ws, request, {
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
