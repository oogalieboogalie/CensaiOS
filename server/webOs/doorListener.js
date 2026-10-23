/**
 * The front door for other computers (Open anywhere).
 *
 * The main censaiOS port answers this computer only: docker-compose.yml
 * publishes it as 127.0.0.1:3002, and a server started outside Docker listens
 * on 127.0.0.1. Other computers on the home network come in through this
 * second port instead, CENSAI_DOOR_PORT (3004 in docker-compose.yml). Every
 * connection that arrives here is marked (door.js markThroughDoor), so the
 * server knows it came from another computer whatever address it claims.
 *
 * Through the door:
 *  - switch off: a page saying how to turn it on, every other request refused
 *  - switch on: the app, but signing in takes a one-time code from the main
 *    computer (or a share link); email and one-click sign-in are refused
 *
 *   CENSAI_DOOR_PORT         port to listen on; "off" = no door. Unset: 3004
 *                            inside Docker, no door anywhere else
 *   CENSAI_DOOR_HOST         default 0.0.0.0
 *   CENSAI_DOOR_PUBLIC_PORT  the port other computers type, when Docker
 *                            publishes the door on a different one
 */
import http from 'http';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { cameThroughDoor, doorUsable, markThroughDoor, readDoorSettings } from './door.js';
import { CLOSED_PAGE } from './closedPage.js';

const log = createLogger('web-os-door');
let listening = null;

const CLOSED_MESSAGE = 'This censaiOS is not open to other computers yet. On your main computer, turn on Settings, Open anywhere.';
const PAIR_MESSAGE = 'On another computer, sign in with a code. On your main computer open Settings, Open anywhere, Add a computer.';
// Every way to sign in without a code: typed email, one-click, Google, Hub.
const SIGN_IN_WITHOUT_CODE = /^\/api\/(auth\/(developer|local|google)|hub-auth)(\/|$)/;

export function doorListenerConfig(env = process.env) {
  const fallback = env.CENSAI_IN_CONTAINER === '1' ? '3004' : '';
  const raw = String(env.CENSAI_DOOR_PORT || fallback).trim().toLowerCase();
  if (!raw || raw === 'off' || raw === '0' || raw === 'false') return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const publicPort = Number(env.CENSAI_DOOR_PUBLIC_PORT) || port;
  return { port, host: env.CENSAI_DOOR_HOST || '0.0.0.0', publicPort };
}

export function doorIsOpen() {
  return doorUsable() && readDoorSettings().open;
}

/** Runs first for every request; does nothing unless it came through the door. */
export function doorGuard(req, res, next) {
  if (!cameThroughDoor(req)) return next();
  if (!doorIsOpen()) {
    if (req.method === 'GET' && req.path.startsWith('/assets/')) return next();
    if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.status(403).type('html').send(CLOSED_PAGE);
    return res.status(403).json({ error: CLOSED_MESSAGE, doorClosed: true });
  }
  if (SIGN_IN_WITHOUT_CODE.test(req.path)) {
    return res.status(403).json({ error: PAIR_MESSAGE, pairRequired: true });
  }
  return next();
}

/**
 * Opens the door port. Live connections (the board's sync, terminals) are
 * handed to the main server's own handlers, which check the sign-in as usual.
 */
export function startDoorListener(mainServer, app, config = doorListenerConfig()) {
  if (!config || listening || !doorUsable()) return null;
  const server = http.createServer(app);
  server.on('connection', markThroughDoor);
  server.on('upgrade', (req, socket, head) => {
    if (!doorIsOpen()) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    mainServer.emit('upgrade', req, socket, head);
  });
  server.listen(config.port, config.host, () => {
    listening = { ...config, server };
    log.info('Open anywhere door listening for other computers', { port: config.port, publicPort: config.publicPort });
  });
  server.on('error', (error) => {
    log.warn('Open anywhere door not opened', { port: config.port, code: safeErrorCode(error) });
  });
  return server;
}

/** The port other computers type, or null when this copy has no door. */
export function doorPublicPort() {
  return listening?.publicPort ?? null;
}

export function stopDoorListener() {
  listening?.server?.close();
  listening = null;
}
