// tests/webOsFrontDoor.test.js
//
// Lock the front door: censaiOS on the owner's computer answers that computer
// only, and other computers come in through the Open anywhere port. These
// start the real app on two real ports, the way docker-compose.yml does, and
// knock on each one: nobody signs in from another computer by typing an email,
// even with a faked Host header, and the door is shut until the owner opens it.

import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { app } from '../server.js';
import { resetDoorCache, writeDoorSettings } from '../server/webOs/door.js';
import {
  doorListenerConfig,
  doorPublicPort,
  startDoorListener,
  stopDoorListener,
} from '../server/webOs/doorListener.js';
import { defaultListenHost } from '../server/boot/lifecycle.js';

let main;
let door;
let stateDir;
const originalStateDir = process.env.HOMEBASE_STATE_DIR;

function listening(server) {
  return new Promise((resolve) => {
    if (server.listening) resolve(server.address().port);
    else server.once('listening', () => resolve(server.address().port));
  });
}

function knock(port, { method = 'GET', path: urlPath = '/', body, host = 'localhost:3002' } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers: { host, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* html */ }
        resolve({ status: res.statusCode, text, json });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

function upgrade(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write('GET /hocuspocus HTTP/1.1\r\nHost: officepc:3004\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n'
        + 'Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    });
    let text = '';
    socket.on('data', (chunk) => { text += chunk; socket.end(); });
    socket.on('close', () => resolve(text.split('\r\n')[0]));
    socket.on('error', reject);
  });
}

function setSwitch(open) {
  writeDoorSettings({ open }, { env: { HOMEBASE_STATE_DIR: stateDir } });
}

beforeAll(async () => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'front-door-'));
  process.env.HOMEBASE_STATE_DIR = stateDir;
  resetDoorCache();
  main = app.listen(0, '127.0.0.1');
  await listening(main);
  // Stands in for the board's live sync: says which door a connection used.
  main.on('upgrade', (req, socket) => {
    socket.end(`HTTP/1.1 418 ${req.socket.remotePort && req.socket[Object.getOwnPropertySymbols(req.socket)
      .find((s) => s.description === 'censai.throughDoor')] ? 'Through the door' : 'Main port'}\r\n\r\n`);
  });
  door = startDoorListener(main, app, { port: 0, host: '127.0.0.1', publicPort: 3004 });
  await listening(door);
});

afterAll(async () => {
  stopDoorListener();
  await new Promise((resolve) => main.close(resolve));
  resetDoorCache();
  if (originalStateDir === undefined) delete process.env.HOMEBASE_STATE_DIR;
  else process.env.HOMEBASE_STATE_DIR = originalStateDir;
  fs.rmSync(stateDir, { recursive: true, force: true });
});

const doorPort = () => door.address().port;
const mainPort = () => main.address().port;

describe('with Open anywhere off (the default)', () => {
  beforeAll(() => setSwitch(false));

  test('another computer gets the "not open yet" page and nothing else', async () => {
    const page = await knock(doorPort(), { path: '/' });
    expect(page.status).toBe(403);
    expect(page.text).toContain('not open to other computers yet');
    for (const [method, urlPath] of [['POST', '/api/auth/developer'], ['POST', '/api/web-os/pair/redeem'], ['GET', '/api/web-os']]) {
      const res = await knock(doorPort(), { method, path: urlPath, body: method === 'POST' ? { email: 'alma@home.test' } : undefined });
      expect(res.status).toBe(403);
      expect(res.json).toMatchObject({ doorClosed: true });
    }
  });

  test('live connections through the door are refused', async () => {
    expect(await upgrade(doorPort())).toBe('HTTP/1.1 403 Forbidden');
    expect(await upgrade(mainPort())).toBe('HTTP/1.1 418 Main port');
  });

  test('this computer is not affected', async () => {
    const res = await knock(mainPort(), { path: '/api/web-os' });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ available: true, open: false, port: 3004, fromAnotherComputer: false });
  });
});

describe('with Open anywhere on', () => {
  beforeAll(() => setSwitch(true));

  test('typing an email does not sign another computer in, even with a faked Host', async () => {
    for (const host of ['localhost:3002', '127.0.0.1:3002', 'officepc:3004']) {
      const res = await knock(doorPort(), { method: 'POST', path: '/api/auth/developer', host, body: { email: 'alma@home.test' } });
      expect(res.status).toBe(403);
      expect(res.json).toMatchObject({ pairRequired: true });
    }
  });

  test('no other sign-in without a code either', async () => {
    for (const urlPath of ['/api/auth/local', '/api/auth/google', '/api/hub-auth/login']) {
      const method = urlPath.endsWith('google') ? 'GET' : 'POST';
      const res = await knock(doorPort(), { method, path: urlPath, body: method === 'POST' ? { username: 'x', password: 'y' } : undefined });
      expect(res.status).toBe(403);
      expect(res.json).toMatchObject({ pairRequired: true });
    }
  });

  test('the one-time code is let through to be checked', async () => {
    const res = await knock(doorPort(), { method: 'POST', path: '/api/web-os/pair/redeem', body: { code: 'WRONG1' } });
    expect(res.json?.pairRequired).toBeUndefined();
    expect(res.json?.doorClosed).toBeUndefined();
  });

  test('the session check knows the visitor is another computer', async () => {
    const res = await knock(doorPort(), { path: '/api/auth/session', host: 'localhost:3002' });
    expect(res.json).toMatchObject({ fromAnotherComputer: true });
  });

  test('the board\'s live sync is handed on, marked as another computer', async () => {
    expect(await upgrade(doorPort())).toBe('HTTP/1.1 418 Through the door');
  });

  test('sign-in on this computer itself is untouched', async () => {
    const res = await knock(mainPort(), { method: 'POST', path: '/api/auth/developer', body: { email: 'alma@home.test' } });
    expect(res.json?.pairRequired).toBeUndefined();
    const session = await knock(mainPort(), { path: '/api/auth/session' });
    expect(session.json).toMatchObject({ fromAnotherComputer: false });
  });
});

describe('where censaiOS listens', () => {
  test('on the owner\'s computer, outside Docker: this computer only', () => {
    expect(defaultListenHost({}, 'local_desktop')).toBe('127.0.0.1');
  });

  test('inside Docker it listens in the container; compose publishes it on 127.0.0.1', () => {
    expect(defaultListenHost({ CENSAI_IN_CONTAINER: '1' }, 'local_desktop')).toBeUndefined();
    const compose = fs.readFileSync(path.join(process.cwd(), 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('- "127.0.0.1:3002:3001"');
    expect(compose).toContain('- "127.0.0.1:5433:5432"');
    expect(compose).toContain('- "127.0.0.1:6335:6333"');
    expect(compose).toContain('- "${CENSAI_OTHER_COMPUTERS_PORT:-3004}:3004"');
    expect(compose).not.toMatch(/^\s*- "3002:3001"/m);
  });

  test('an explicit setting and cloud servers keep their own', () => {
    expect(defaultListenHost({ CENSAI_LISTEN_HOST: '0.0.0.0' }, 'local_desktop')).toBe('0.0.0.0');
    expect(defaultListenHost({}, 'cloud_saas')).toBeUndefined();
  });

  test('the door port comes from CENSAI_DOOR_PORT, 3004 in Docker, off elsewhere', () => {
    expect(doorListenerConfig({})).toBeNull();
    expect(doorListenerConfig({ CENSAI_DOOR_PORT: 'off' })).toBeNull();
    // An older compose file: the image still opens its door, published or not.
    expect(doorListenerConfig({ CENSAI_IN_CONTAINER: '1' })).toMatchObject({ port: 3004 });
    expect(doorListenerConfig({ CENSAI_IN_CONTAINER: '1', CENSAI_DOOR_PORT: 'off' })).toBeNull();
    expect(doorListenerConfig({ CENSAI_DOOR_PORT: '3004' })).toEqual({ port: 3004, host: '0.0.0.0', publicPort: 3004 });
    expect(doorListenerConfig({ CENSAI_DOOR_PORT: '3004', CENSAI_DOOR_PUBLIC_PORT: '4004' }).publicPort).toBe(4004);
    expect(doorPublicPort()).toBe(3004);
  });
});
