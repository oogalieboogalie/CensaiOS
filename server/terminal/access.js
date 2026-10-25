import pool from '../db.js';
import { getRuntimeMode, localFilesSwitchedOff, RUNTIME_MODES } from '../middleware/runtimeMode.js';
import { requireWorkspaceMember } from '../workspaces/context.js';
import { assertSystemAdmin } from '../security/systemAdmin.js';
import { isFromAnotherComputer } from '../webOs/door.js';
import { logOwnerRefusal, ownerNamesFor, ownerNamesSentence } from '../security/ownerNames.js';

export const TERMINAL_WS_PATH = '/api/terminal';

export const OWNER_ONLY_HERE = "This terminal runs commands on this computer, so only this computer's owner account can open one. The account you're signed in with isn't the owner. Sign in with the owner account to use the terminal.";
export const OWNER_ONLY_REMOTE = "This terminal runs commands on the computer censaiOS runs on, so only that computer's owner can open one. Ask them to open it for you.";

function accessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function terminalRuntimeAccess({ mode = getRuntimeMode(), env = process.env } = {}) {
  if (mode === RUNTIME_MODES.CLOUD_SAAS) {
    return { allowed: false, reason: 'Terminal execution is disabled in cloud mode.' };
  }
  if (localFilesSwitchedOff(env)) {
    return { allowed: false, reason: "This censaiOS is shared, so its terminal is switched off (CENSAI_LOCAL_FILES=off)." };
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
    logOwnerRefusal('terminal', 401);
    throw accessError('Authentication is required.', 401, 'TERMINAL_AUTH_REQUIRED');
  }
  // A terminal runs commands on this computer (or in a sandbox holding its
  // folders), so only the computer's owner may open one, whatever the board.
  try {
    await assertSystemAdmin({ session: { userId } }, { db });
  } catch (error) {
    const refused = accessError(error.message, error.statusCode || 500, 'TERMINAL_OWNER_ONLY');
    if (refused.statusCode === 403) {
      logOwnerRefusal('terminal', 403);
      refused.ownerNames = await ownerNamesFor(userId, { db, mode });
    }
    throw refused;
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

/**
 * Signed in, but not this computer's owner: open the line just long enough
 * to say so in plain words, then close it. A refused upgrade reaches the
 * window only as a dropped line, which read as "Connection lost.
 * Reconnecting…" before the real reason showed.
 */
function refuseOwnerOnly(socket, { wss, request, head }, names = null) {
  const remote = isFromAnotherComputer(request);
  const named = remote ? '' : ownerNamesSentence(names);
  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.send(JSON.stringify({
      type: 'refused',
      reason: 'owner-only',
      message: remote ? OWNER_ONLY_REMOTE : [OWNER_ONLY_HERE, named].filter(Boolean).join(' '),
    }));
    ws.close(4403, 'owner only');
  });
}

export function rejectTerminalUpgrade(socket, error, upgrade = null) {
  if (upgrade?.wss && error?.code === 'TERMINAL_OWNER_ONLY' && error.statusCode === 403) {
    refuseOwnerOnly(socket, upgrade, error.ownerNames);
    return;
  }
  const status = Number(error?.statusCode) || 500;
  const label = status === 400 ? 'Bad Request'
    : status === 401 ? 'Unauthorized'
      : status === 403 ? 'Forbidden'
        : 'Internal Server Error';
  try { socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n\r\n`); } catch { /* closed */ }
  try { socket.destroy(); } catch { /* closed */ }
}
