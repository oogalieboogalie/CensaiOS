import path from 'path';
import { WebSocket } from 'ws';
import { createLogger } from '../logger.js';

export const log = createLogger('terminal');

export function safeJsonSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function resolveCwd(rawCwd) {
  const fallback = process.cwd();
  if (!rawCwd || typeof rawCwd !== 'string') return fallback;
  const resolved = path.resolve(rawCwd);
  return resolved || fallback;
}

export const PTY_ENV = {
  ...process.env,
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
};

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
