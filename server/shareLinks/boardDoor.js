// Loopback proxy in front of censaiOS. A public tunnel points here, never at
// the main port. Requests that are not the shared board are refused.

import http from 'node:http';
import net from 'node:net';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { boardDoorAllows, publicHostFrom } from './boardDoorRules.js';

const log = createLogger('board-door');
const REFUSAL = 'This address opens one shared board.';

function allowedUrl(req) {
  const url = new URL(req.url, 'http://board-door.local');
  return boardDoorAllows({ method: req.method, path: url.pathname, search: url.search });
}

function forwardedHeaders(req) {
  const headers = { ...req.headers };
  const host = publicHostFrom(req);
  if (host) {
    headers.host = host;
    headers['x-forwarded-host'] = host;
  }
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-for'] = String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || 'board-door');
  return headers;
}

function refuse(res) {
  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(REFUSAL);
}

/**
 * @param {{ upstreamPort: number, host?: string }} options
 * @returns {Promise<{ port: number, close: () => void }>}
 */
export function startBoardDoor({ upstreamPort, host = '127.0.0.1' }) {
  const upstream = { host: '127.0.0.1', port: upstreamPort };
  const server = http.createServer((req, res) => {
    if (!allowedUrl(req)) return refuse(res);
    const proxy = http.request({
      host: upstream.host,
      port: upstream.port,
      method: req.method,
      path: req.url,
      headers: forwardedHeaders(req),
    }, (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    });
    proxy.on('error', (error) => {
      log.warn('board door could not reach the app', { code: safeErrorCode(error) });
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('This board is not reachable right now.');
    });
    req.pipe(proxy);
    return undefined;
  });

  server.on('upgrade', (req, socket, head) => {
    if (!allowedUrl(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const conn = net.connect(upstream.port, upstream.host, () => {
      const headers = forwardedHeaders(req);
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [key, value] of Object.entries(headers)) {
        if (value == null) continue;
        raw += `${key}: ${Array.isArray(value) ? value.join(', ') : value}\r\n`;
      }
      conn.write(`${raw}\r\n`);
      if (head?.length) conn.write(head);
      socket.pipe(conn);
      conn.pipe(socket);
    });
    const drop = () => { socket.destroy(); conn.destroy(); };
    conn.on('error', drop);
    socket.on('error', drop);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      const port = server.address().port;
      resolve({ port, close: () => server.close() });
    });
  });
}
