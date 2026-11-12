// A way in for Tailscale devices on a copy that has no Open anywhere port:
// the desktop app, or a server started without Docker. Those answer this
// computer only (127.0.0.1). With "My Tailscale devices" switched on, this
// opens one more port, bound to this computer's own Tailscale address, so a
// device on the home Wi-Fi that is not on the tailnet cannot even connect.
//
// Every connection here is marked as coming from another computer
// (door.js) and as Tailscale-only (visit.js): a device is switched on in the
// owner's list, or it is refused. Nobody signs in with a code on this port.

import http from 'node:http';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { doorUsable, markThroughDoor } from '../webOs/door.js';
import { readTailnetSettings } from './settings.js';
import { watchVisitorSocket } from './signIns.js';
import { tailnetStatus } from './status.js';
import { markTailnetPort, tailnetVisit } from './visit.js';

const log = createLogger('tailnet');
export const DEFAULT_TAILNET_PORT = 3004;
const RECHECK_MS = 30 * 1000;

let wiring = null; // { mainServer, app, doorPort }
let listening = null; // { server, address, port }
let problem = '';
let timer = null;

export function tailnetPortNumber(env = process.env) {
  const port = Number(env.CENSAI_DOOR_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_TAILNET_PORT;
}

function close() {
  listening?.server?.close();
  listening?.server?.closeAllConnections?.();
  listening = null;
}

function open(address, port) {
  const { mainServer, app } = wiring;
  const server = http.createServer(app);
  server.on('connection', (socket) => { markThroughDoor(socket); markTailnetPort(socket); watchVisitorSocket(socket); });
  server.on('upgrade', async (req, socket, head) => {
    const visit = await Promise.resolve(tailnetVisit(req)).catch(() => null);
    if (!visit?.admitted) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    mainServer.emit('upgrade', req, socket, head);
  });
  server.on('error', (error) => {
    const what = error?.code === 'EADDRINUSE' ? 'port-busy' : 'could-not-open';
    // The timer tries again every half minute; say it once, not every time.
    if (problem !== what) log.warn('Tailscale port not opened', { port, code: safeErrorCode(error) });
    problem = what;
    if (listening?.server === server) listening = null;
  });
  listening = { server, address, port };
  // Resolves once the port is open or has failed, so the card never shows
  // an address that nothing is listening on.
  return new Promise((resolve) => {
    server.once('error', resolve);
    server.listen(port, address, () => {
      problem = '';
      log.info('Tailscale port listening for switched-on devices', { port });
      resolve();
    });
  });
}

/**
 * Opens, moves or closes the port to match the switch and Tailscale's state.
 * Safe to call any time: after the switch changes, and on a slow timer in
 * case Tailscale came up after censaiOS did.
 */
export async function syncTailnetListener() {
  if (!wiring) return tailnetListenerState();
  const wanted = doorUsable() && readTailnetSettings().on && wiring.doorPort === null && process.env.CENSAI_IN_CONTAINER !== '1';
  if (!wanted) {
    close();
    problem = '';
    return tailnetListenerState();
  }
  const status = await tailnetStatus().catch(() => null);
  const address = status?.connected ? status.self.addresses.find((item) => !item.includes(':')) : '';
  if (!address) {
    close();
    return tailnetListenerState();
  }
  const port = tailnetPortNumber();
  if (listening && (listening.address !== address || listening.port !== port)) close();
  if (!listening) await open(address, port);
  return tailnetListenerState();
}

/** Called once at server start (webOs/doorListener.js). `doorPort` is the Open anywhere port, or null. */
export function startTailnetListener(mainServer, app, { doorPort = null } = {}) {
  wiring = { mainServer, app, doorPort };
  syncTailnetListener().catch(() => {});
  if (!timer) {
    timer = setInterval(() => { syncTailnetListener().catch(() => {}); }, RECHECK_MS);
    timer.unref?.();
  }
}

export function stopTailnetListener() {
  if (timer) clearInterval(timer);
  timer = null;
  close();
  wiring = null;
  problem = '';
}

/** `port` is where Tailscale devices come in: this port, or the Open anywhere one. */
export function tailnetListenerState() {
  return {
    ownPort: Boolean(listening),
    port: listening?.port ?? wiring?.doorPort ?? null,
    problem,
  };
}
