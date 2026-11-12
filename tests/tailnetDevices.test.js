// tests/tailnetDevices.test.js
//
// "My Tailscale devices": a device on the owner's tailnet that the owner
// switched on opens censaiOS with no code, signed in as the owner. Every
// other device is refused: one that is not switched on, one that is only on
// the Wi-Fi, one that claims a Tailscale address in a header. Switching a
// device off puts it out at once.
//
// A real server on a real port stands in for the port other computers use.
// The far end of each connection is set by the test, the way Tailscale sets
// it for real.

import { jest } from '@jest/globals';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const query = jest.fn();
jest.unstable_mockModule('../server/db.js', () => ({ default: { query, on: jest.fn() } }));
jest.unstable_mockModule('../server/dbState.js', () => ({ dbReady: () => true, setDbReady: () => {} }));
const passThrough = (_req, _res, next) => next();
jest.unstable_mockModule('../server/middleware/standardRateLimits.js', () => ({
  authSecurityRateLimiter: passThrough,
  resourceRateLimiter: passThrough,
}));

const { doorAllowsOrigin, markThroughDoor, resetDoorCache, writeDoorSettings } = await import('../server/webOs/door.js');
const { doorGuard } = await import('../server/webOs/doorListener.js');
const { webOsPublicRouter, webOsRouter } = await import('../server/routes/webOs.js');
const { resetTailnetSettingsCache, writeTailnetSettings, readTailnetSettings } = await import('../server/tailnet/settings.js');
const { setTailnetReader, tailnetStatus } = await import('../server/tailnet/status.js');
const { markTailnetPort } = await import('../server/tailnet/visit.js');
const { watchVisitorSocket } = await import('../server/tailnet/signIns.js');

const OWNER = { id: 7, email: 'alma@example.com', name: 'Alma', role: 'admin' };
const PHONE = '100.101.1.2';
const LAPTOP = '100.101.1.3';
const STRANGER = '100.101.9.9'; // a Tailscale-range address Tailscale never listed
const WIFI = '192.168.1.40';

// What `tailscale status --json` prints, with made-up devices.
const TAILNET = {
  BackendState: 'Running',
  Self: { ID: 'nSELF', HostName: 'officepc', DNSName: 'officepc.tail1234.ts.net.', OS: 'windows', UserID: 1, TailscaleIPs: ['100.101.1.1', 'fd7a:115c:a1e0::1'], Online: true },
  Peer: {
    k1: { ID: 'nPHONE', HostName: 'localhost', DNSName: 'almas-phone.tail1234.ts.net.', OS: 'android', UserID: 1, TailscaleIPs: [PHONE], Online: true },
    k2: { ID: 'nLAPTOP', HostName: 'laptop', DNSName: 'laptop.tail1234.ts.net.', OS: 'linux', UserID: 1, TailscaleIPs: [LAPTOP], Online: true },
    k3: { ID: 'nSAM', HostName: 'sams-mac', DNSName: 'sams-mac.tail1234.ts.net.', OS: 'macOS', UserID: 2, TailscaleIPs: ['100.101.1.4'], Online: false },
  },
  User: { 1: { LoginName: 'alma@example.com' }, 2: { LoginName: 'sam@example.com' } },
};

let stateDir;
let server;
let from = { address: WIFI, tailnetPort: false };
const origin = () => `http://127.0.0.1:${server.address().port}`;
// Every visitor types this computer's own Tailscale address unless a test says otherwise.
const OWN_ADDRESS = '100.101.1.1:3004';
function visit(address, { tailnetPort = false, host = OWN_ADDRESS } = {}) {
  from = { address, tailnetPort };
  const to = request(origin());
  return Object.fromEntries(['get', 'post', 'put'].map((verb) => [verb, (url) => to[verb](url).set('Host', host)]));
}
const visitAs = (address) => { from = { address, tailnetPort: false }; return request.agent(origin()).set('Host', OWN_ADDRESS); };

function buildApp() {
  const app = express();
  app.use(express.json());
  // One connection per request, so each request has the far end the test set.
  app.use((_req, res, next) => { res.set('Connection', 'close'); next(); });
  app.use(session({ secret: 'test-secret', resave: false, saveUninitialized: false }));
  app.use(doorGuard);
  app.use('/api/web-os', webOsPublicRouter);
  app.get('/api/who', (req, res) => res.json({ userId: req.session?.userId ?? null, device: req.tailnetDevice?.name ?? null }));
  // Stands in for the owner's signed-in session on the main computer.
  app.use('/api/web-os', (req, _res, next) => { if (req.get('x-test-owner')) Object.assign(req.session, { userId: OWNER.id, userRole: 'admin' }); next(); }, webOsRouter);
  app.get('/', (_req, res) => res.type('html').send('<title>the board</title>'));
  return app;
}

function useTailnet(raw = TAILNET) {
  setTailnetReader(async () => ({ raw, source: 'program' }));
}

function switchOn(...ids) {
  writeTailnetSettings({ on: true, ownerId: OWNER.id, allow: ids.map((id) => ({ id, name: id })) });
}

beforeAll(async () => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tailnet-'));
  process.env.HOMEBASE_STATE_DIR = stateDir;
  server = http.createServer(buildApp());
  server.on('connection', (socket) => {
    markThroughDoor(socket);
    watchVisitorSocket(socket);
    if (from.tailnetPort) markTailnetPort(socket);
    const { address } = from;
    Object.defineProperty(socket, 'remoteAddress', { get: () => address });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  setTailnetReader(null);
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  delete process.env.HOMEBASE_STATE_DIR;
  resetDoorCache();
  resetTailnetSettingsCache();
  fs.rmSync(stateDir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(stateDir, 'tailnet.json'), { force: true });
  fs.rmSync(path.join(stateDir, 'web-os.json'), { force: true });
  resetDoorCache();
  resetTailnetSettingsCache();
  useTailnet();
  query.mockReset();
  query.mockResolvedValue({ rows: [OWNER] });
});

describe('the switch is off (the default)', () => {
  test('a Tailscale device is treated like any other computer: the usual closed page, no sign-in', async () => {
    const page = await visit(PHONE).get('/');
    expect(page.status).toBe(403);
    expect(page.text).toContain('not open to other computers yet');
    const enter = await visit(PHONE).post('/api/web-os/tailnet/enter').send({});
    expect(enter.status).toBe(403);
    expect(enter.body.doorClosed).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('the switch is on', () => {
  test('a device that is not switched on is refused, and the page names it', async () => {
    switchOn('nLAPTOP');
    const page = await visit(PHONE).get('/');
    expect(page.status).toBe(403);
    expect(page.text).toContain('almas-phone is not switched on yet');
    expect(page.text).toContain('My Tailscale devices');
    const api = await visit(PHONE).get('/api/web-os/tailnet/hello');
    expect(api.status).toBe(403);
    expect(api.body).toMatchObject({ doorClosed: true, app: 'censaiOS', tailnet: 'not-switched-on' });
    const enter = await visit(PHONE).post('/api/web-os/tailnet/enter').send({});
    expect(enter.status).toBe(403);
    expect(enter.headers['set-cookie']).toBeUndefined();
  });

  test('a switched-on device opens the board and signs in as the owner with no code', async () => {
    switchOn('nPHONE');
    const phone = visitAs(PHONE);
    expect((await phone.get('/')).status).toBe(200);
    const hello = await phone.get('/api/web-os/tailnet/hello');
    expect(hello.body).toEqual({ app: 'censaiOS', name: 'officepc', device: 'almas-phone', admitted: true });
    expect((await phone.get('/api/who')).body).toEqual({ userId: null, device: 'almas-phone' });
    const enter = await phone.post('/api/web-os/tailnet/enter').send({});
    expect(enter.status).toBe(200);
    expect(enter.body).toMatchObject({ ok: true, user: { id: 7, name: 'Alma' }, device: 'almas-phone' });
    expect((await phone.get('/api/who')).body.userId).toBe(7);
  });

  test('a computer that is only on the Wi-Fi is refused, even when it claims a Tailscale address', async () => {
    switchOn('nPHONE');
    const page = await visit(WIFI).get('/').set('X-Forwarded-For', PHONE).set('Tailscale-User-Login', 'alma@example.com');
    expect(page.status).toBe(403);
    expect(page.text).toContain('not open to other computers yet');
    const enter = await visit(WIFI).post('/api/web-os/tailnet/enter').set('X-Forwarded-For', PHONE).send({});
    expect(enter.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  test('a switched-on device is refused under any name that is not this computer\'s own Tailscale address', async () => {
    switchOn('nPHONE');
    // A web page elsewhere points a name of its own at this computer; the
    // phone's browser would carry that page's requests here.
    for (const host of ['evil.example:3004', '100.101.1.2:3004', 'officepc.tail1234.ts.net.evil.example:3004', '127.0.0.1:3004']) {
      const page = await visit(PHONE, { host }).get('/');
      expect(page.status).toBe(403);
      expect(page.text).toContain('Open censaiOS at its Tailscale address');
      const hello = await visit(PHONE, { host }).get('/api/web-os/tailnet/hello');
      expect(hello.status).toBe(403);
      expect(hello.body.device).toBeUndefined();
      expect((await visit(PHONE, { host }).post('/api/web-os/tailnet/enter').send({})).status).toBe(403);
    }
    for (const host of ['officepc.tail1234.ts.net:3004', 'officepc:3004', '[fd7a:115c:a1e0::1]:3004']) {
      expect((await visit(PHONE, { host }).get('/')).status).toBe(200);
    }
  });

  test('one slow answer from Tailscale does not throw a switched-on device out; staying silent does', async () => {
    switchOn('nPHONE');
    expect((await visit(PHONE).get('/')).status).toBe(200);
    const realNow = Date.now;
    try {
      let clock = realNow();
      Date.now = () => clock;
      const statusModule = await import('../server/tailnet/status.js');
      // Keep the answer already read; from now on Tailscale says nothing.
      const silent = async () => ({ reason: 'no-answer', source: 'program' });
      statusModule.swapTailnetReader(silent);
      clock += 30 * 1000;
      expect((await visit(PHONE).get('/')).status).toBe(200);
      clock += 3 * 60 * 1000;
      expect((await visit(PHONE).get('/')).status).toBe(403);
    } finally {
      Date.now = realNow;
    }
  });

  test('a Tailscale address that Tailscale never listed is refused', async () => {
    switchOn('nPHONE');
    const page = await visit(STRANGER).get('/');
    expect(page.status).toBe(403);
    expect(page.text).toContain('does not recognise this device');
    expect((await visit(STRANGER).post('/api/web-os/tailnet/enter').send({})).status).toBe(403);
  });

  test('with Open anywhere also on, a device that is not switched on still needs a code', async () => {
    switchOn('nLAPTOP');
    writeDoorSettings({ open: true });
    expect((await visit(PHONE).get('/')).status).toBe(200);
    const enter = await visit(PHONE).post('/api/web-os/tailnet/enter').send({});
    expect(enter.status).toBe(403);
    expect(enter.body.notSwitchedOn).toBe(true);
    const hello = await visit(PHONE).get('/api/web-os/tailnet/hello');
    expect(hello.body).toMatchObject({ app: 'censaiOS', admitted: false });
    // Asked under a name that is not this computer's own, it tells no names.
    const elsewhere = await visit(PHONE, { host: 'evil.example:3004' }).get('/api/web-os/tailnet/hello');
    expect(elsewhere.status).toBe(404);
    expect(elsewhere.body.name).toBeUndefined();
  });

  test('on the Tailscale-only port there is no code: switched on, or refused', async () => {
    switchOn('nLAPTOP');
    writeDoorSettings({ open: true });
    const refused = await visit(PHONE, { tailnetPort: true }).get('/');
    expect(refused.status).toBe(403);
    expect(refused.text).toContain('almas-phone is not switched on yet');
    expect((await visit(WIFI, { tailnetPort: true }).get('/')).status).toBe(403);
    expect((await visit(LAPTOP, { tailnetPort: true }).get('/')).status).toBe(200);
  });

  test('when Tailscale is signed out, nobody gets in, switched on or not', async () => {
    switchOn('nPHONE');
    useTailnet({ ...TAILNET, BackendState: 'NeedsLogin' });
    expect((await visit(PHONE).get('/')).status).toBe(403);
    expect((await visit(PHONE).post('/api/web-os/tailnet/enter').send({})).status).toBe(403);
  });

  test('the sign-in is refused when the person who turned the switch on is gone', async () => {
    switchOn('nPHONE');
    query.mockResolvedValue({ rows: [] });
    const enter = await visit(PHONE).post('/api/web-os/tailnet/enter').send({});
    expect(enter.status).toBe(409);
    expect(enter.headers['set-cookie']).toBeUndefined();
  });
});

describe('switching a device off', () => {
  const owner = () => visit('127.0.0.9').put('/api/web-os/tailnet').set('x-test-owner', '1');

  test('ends its sign-in and closes the door on it at once', async () => {
    switchOn('nPHONE');
    const phone = visitAs(PHONE);
    await phone.post('/api/web-os/tailnet/enter').send({});
    expect((await phone.get('/api/who')).body.userId).toBe(7);

    writeDoorSettings({ open: true }); // so the owner's request below gets through this test server
    const saved = await owner().send({ devices: { nPHONE: false } });
    expect(saved.status).toBe(200);
    expect(readTailnetSettings().devices.nPHONE).toBeUndefined();
    // Sign-ins saved before a restart are ended in the saved sign-ins too.
    expect(query).toHaveBeenCalledWith(expect.stringContaining("sess->>'tailnetDeviceId' = ANY"), [['nPHONE']]);

    // With Open anywhere on the page still loads, but the sign-in is gone.
    from = { address: PHONE, tailnetPort: false };
    expect((await phone.get('/api/who')).body).toEqual({ userId: null, device: null });
    writeDoorSettings({ open: false });
    expect((await phone.get('/')).status).toBe(403);
  });

  test('an owner who switches off the device they are holding still gets the answer, then is out', async () => {
    switchOn('nPHONE');
    const saved = await visit(PHONE).put('/api/web-os/tailnet').set('x-test-owner', '1').send({ devices: { nPHONE: false } });
    expect(saved.status).toBe(200);
    expect(saved.body.devices.find((device) => device.id === 'nPHONE').on).toBe(false);
    expect((await visit(PHONE).get('/')).status).toBe(403);
  });

  test('a sign-in cookie copied to another device does not work there', async () => {
    switchOn('nPHONE', 'nLAPTOP');
    const phone = visitAs(PHONE);
    const enter = await phone.post('/api/web-os/tailnet/enter').send({});
    const cookie = enter.headers['set-cookie'][0].split(';')[0];
    const onLaptop = await visit(LAPTOP).get('/api/who').set('Cookie', cookie);
    expect(onLaptop.body).toEqual({ userId: null, device: 'laptop' });
  });

  test('turning the whole switch off ends every device sign-in', async () => {
    switchOn('nPHONE');
    const phone = visitAs(PHONE);
    await phone.post('/api/web-os/tailnet/enter').send({});
    writeDoorSettings({ open: true });
    expect((await owner().send({ on: false })).body.on).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("sess->>'tailnetDeviceId' IS NOT NULL"));
    from = { address: PHONE, tailnetPort: false };
    expect((await phone.get('/api/who')).body.userId).toBeNull();
  });
});

describe('other copies of censaiOS', () => {
  test('the board is told to stop asking when nothing can show here', async () => {
    writeDoorSettings({ open: true });
    // The switch is off.
    expect((await visit('127.0.0.9').get('/api/web-os/tailnet/nearby').set('x-test-owner', '1')).body).toEqual({ copies: [], watching: false });
    // The switch is on, but this page was opened from another computer.
    switchOn('nPHONE');
    expect((await visit(PHONE).get('/api/web-os/tailnet/nearby').set('x-test-owner', '1')).body).toEqual({ copies: [], watching: false });
  });
});

describe('the owner\'s card', () => {
  const card = () => visit('127.0.0.9').get('/api/web-os/tailnet').set('x-test-owner', '1');
  beforeEach(() => writeDoorSettings({ open: true }));

  test('lists the tailnet devices, whose they are and which are switched on', async () => {
    switchOn('nPHONE');
    const { body } = await card();
    expect(body).toMatchObject({ on: true, connected: true, canManage: true, thisComputer: { name: 'officepc' } });
    expect(body.devices.map((d) => [d.name, d.kind, d.online, d.mine, d.on])).toEqual([
      ['almas-phone', 'phone', true, true, true],
      ['laptop', 'computer', true, true, false],
      ['sams-mac', 'computer', false, false, false],
    ]);
    expect(body.devices[2].owner).toBe('sam@example.com');
  });

  test('only a device Tailscale lists can be switched on, and the switch remembers who turned it on', async () => {
    const saved = await visit('127.0.0.9').put('/api/web-os/tailnet').set('x-test-owner', '1')
      .send({ on: true, devices: { nLAPTOP: true, nMADEUP: true } });
    expect(saved.status).toBe(200);
    expect(Object.keys(readTailnetSettings().devices)).toEqual(['nLAPTOP']);
    expect(readTailnetSettings()).toMatchObject({ on: true, ownerId: 7 });
  });
});

describe('which page may talk to this computer', () => {
  test('its own Tailscale address and name, only while the switch is on', async () => {
    await tailnetStatus({ maxAgeMs: 0 });
    const own = ['100.101.1.1:3004', 'officepc.tail1234.ts.net:3004', '[fd7a:115c:a1e0::1]:3004'];
    for (const host of own) expect(doorAllowsOrigin(`http://${host}`, host)).toBe(false);
    switchOn('nPHONE');
    for (const host of own) expect(doorAllowsOrigin(`http://${host}`, host)).toBe(true);
    // Another device's address, a look-alike name, or a page whose address is not the one asked.
    for (const host of ['100.101.1.2:3004', 'officepc.tail1234.ts.net.evil.example:3004', 'evil.example:3004']) {
      expect(doorAllowsOrigin(`http://${host}`, host)).toBe(false);
    }
    expect(doorAllowsOrigin('http://evil.example', '100.101.1.1:3004')).toBe(false);
  });
});
