import { createLogger } from '../logger.js';
import { isAllowedBrowserOrigin, isAllowedRequestHost, originHasUserinfo } from '../security/httpBoundary.js';
import { isJestRun } from '../security/testShortcut.js';
import { doorAllowsOrigin } from '../webOs/door.js';

const log = createLogger('upgrade-origin');

// A browser upgrade has to come from this app's own page. The session cookie
// is SameSite=Lax, and another localhost port is the same site, so a page
// started with Run dev could otherwise open the terminal as the signed-in owner.
//
// A script opens the socket with Origin set to this app's own address
// (APP_ORIGIN). Jest's in-process sockets send no Origin; that shortcut is
// isJestRun() (NODE_ENV=test and JEST_WORKER_ID together). A real process
// with only NODE_ENV=test is refused.
//
// Follow-up: a short-lived ticket from a same-origin POST, checked here as
// well as Origin. Not issued yet — the handshake still trusts Origin.

export function upgradeOriginAllowed(request, {
  appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173',
  env = process.env,
} = {}) {
  const origin = request?.headers?.origin;
  if (originHasUserinfo(origin)) return false;
  const host = request?.headers?.host;
  const originText = Array.isArray(origin) ? '' : origin;
  const hostText = Array.isArray(host) ? host.join(',') : host;
  const doorOk = Boolean(originText) && doorAllowsOrigin(originText, hostText);
  if (!isAllowedRequestHost(host, {
    appOrigin,
    apiOrigin: env.API_ORIGIN,
    nodeEnv: env.NODE_ENV,
    doorOk,
  })) return false;
  if (!origin) return isJestRun(env);
  if (Array.isArray(origin)) return false;
  if (doorOk) return true;
  return isAllowedBrowserOrigin(origin, { appOrigin });
}

/** @returns {boolean} true when the upgrade was refused and the socket closed. */
export function rejectUpgradeUnlessOwnOrigin(request, socket) {
  if (upgradeOriginAllowed(request)) return false;
  log.info('upgrade origin refused');
  try { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); } catch { /* already closed */ }
  try { socket.destroy(); } catch { /* already closed */ }
  return true;
}
