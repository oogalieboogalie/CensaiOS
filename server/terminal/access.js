import pool from '../db.js';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { requireWorkspaceMember } from '../workspaces/context.js';

export const TERMINAL_WS_PATH = '/api/terminal';

function accessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function terminalRuntimeAccess({ mode = getRuntimeMode(), env = process.env } = {}) {
  if (mode === RUNTIME_MODES.CLOUD_SAAS) {
    return { allowed: false, reason: 'Terminal execution is disabled in cloud mode.' };
  }
  if (mode === RUNTIME_MODES.PRIVATE_SERVER && env.HOMEBASE_ALLOW_LOCAL_FILES !== 'true') {
    return { allowed: false, reason: 'Terminal execution requires HOMEBASE_ALLOW_LOCAL_FILES=true.' };
  }
  return { allowed: true, reason: null };
}

export async function authorizeTerminalConnection(requestUrl, actor, {
  db = pool,
  mode = getRuntimeMode(),
  env = process.env,
} = {}) {
  const runtime = terminalRuntimeAccess({ mode, env });
  if (!runtime.allowed) throw accessError(runtime.reason, 403, 'TERMINAL_RUNTIME_DISABLED');
  const userId = Number(actor?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw accessError('Authentication is required.', 401, 'TERMINAL_AUTH_REQUIRED');
  }
  const workspaceId = String(requestUrl?.searchParams?.get('workspaceId') || '').trim();
  if (!workspaceId) {
    throw accessError('Open a workspace before starting a terminal.', 400, 'TERMINAL_WORKSPACE_REQUIRED');
  }
  const workspace = await requireWorkspaceMember(db, {
    userId,
    workspaceId,
    roles: ['owner', 'admin', 'member'],
  });
  return { userId: String(userId), workspaceId: workspace.id, role: workspace.role };
}

export function terminalSessionKey({ userId, workspaceId, sessionId }) {
  const parts = [userId, workspaceId, sessionId].map(value => encodeURIComponent(String(value || '').trim()));
  if (parts.some(part => !part)) throw accessError('Terminal session scope is incomplete.', 400,
    'TERMINAL_SESSION_SCOPE_REQUIRED');
  return parts.join(':');
}

export function rejectTerminalUpgrade(socket, error) {
  const status = Number(error?.statusCode) || 500;
  const label = status === 400 ? 'Bad Request'
    : status === 401 ? 'Unauthorized'
      : status === 403 ? 'Forbidden'
        : 'Internal Server Error';
  try { socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n\r\n`); } catch { /* closed */ }
  try { socket.destroy(); } catch { /* closed */ }
}
