import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { createLogger } from '../logger.js';
import { resolveProjectPathForRuntime } from '../workspaces/shared.js';

export const log = createLogger('terminal');

export function safeJsonSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function isDirectory(dir) {
  try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

// Where the shell starts. A folder this server can't reach (D:\Repos on a
// PC running censaiOS in Docker, when only D:\Repos\CensaiHub is shared
// with the container) used to become "/app/D:\Repos": the sandbox refused
// it and the plain shell died at once, so the terminal never opened. Now the
// shell starts in the app's folder and `unreachable` says which folder failed.
export function resolveTerminalCwd(rawCwd) {
  const fallback = process.cwd();
  if (!rawCwd || typeof rawCwd !== 'string' || !rawCwd.trim()) return { cwd: fallback, unreachable: null };
  // The board stores folders the way the person sees them (D:\Sites\shop
  // on a Windows PC running censaiOS in Docker); the shell needs the path
  // this server sees.
  let resolved = '';
  try { resolved = resolveProjectPathForRuntime(rawCwd) || path.resolve(rawCwd); } catch { resolved = ''; }
  // A drive letter left in a Linux path means the folder never got mapped
  // (and its colon would break Docker's -v folder link).
  const unmappedDrive = process.platform !== 'win32' && /[a-z]:[\\/]/i.test(resolved);
  if (resolved && !unmappedDrive && isDirectory(resolved)) return { cwd: resolved, unreachable: null };
  return { cwd: fallback, unreachable: rawCwd };
}

// The app's own secrets (session secret, database password, API keys) stay
// out of terminal shells: a shell is for the person's work, not the app's.
const SECRET_ENV_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|_KEY$|PRIVATE|CREDENTIAL|DATABASE_URL|COOKIE/i;

export function terminalEnv(env = process.env) {
  const clean = {};
  for (const [name, value] of Object.entries(env)) {
    if (!SECRET_ENV_NAME.test(name)) clean[name] = value;
  }
  return { ...clean, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}

export const PTY_ENV = terminalEnv();

export const USE_CONPTY_DLL = process.platform === 'win32';

export function ptyOptions(size, cwd) {
  const opts = {
    name: 'xterm-256color',
    cols: size.cols,
    rows: size.rows,
    env: PTY_ENV,
    useConptyDll: USE_CONPTY_DLL,
  };
  if (cwd) opts.cwd = cwd;
  return opts;
}

export const sessions = new Map();
export const SCROLLBACK_MAX = 64 * 1024;
export const REAP_GRACE_MS = 1500;
export const AGENT_IDLE_REAP_MS = 30 * 60 * 1000;

export function broadcast(session, payload) {
  for (const ws of session.sockets) safeJsonSend(ws, payload);
}

export function appendScrollback(session, data) {
  session.scrollback += data;
  if (session.scrollback.length > SCROLLBACK_MAX) {
    session.scrollback = session.scrollback.slice(-SCROLLBACK_MAX);
  }
}
