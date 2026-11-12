// "My Tailscale devices" (server/tailnet/): the devices on the owner's
// tailnet, which of them are switched on, and one-click sign-in for those.
// Both routers hang under /api/web-os/tailnet (server/routes/webOs.js).
//
// No sign-in needed (tailnetPublicRouter, before the sign-in guard):
//   GET  /hello   what a visiting tailnet device, or another censaiOS, may know
//   POST /enter   a switched-on device signs in as the owner, with no code
// Signed in (tailnetRouter):
//   GET  /        the card in Settings: the switch, the devices, the address
//   PUT  /        { on?, devices?: { <id>: true|false } }  the owner only
//   GET  /nearby  other copies of censaiOS on the tailnet

import express from 'express';
import pool from '../db.js';
import { dbReady } from '../dbState.js';
import { createLogger } from '../logger.js';
import { safeErrorCode } from '../security/errorCode.js';
import { authSecurityRateLimiter } from '../middleware/standardRateLimits.js';
import { establishAuthenticatedSession } from '../security/authSession.js';
import { isJestRun } from '../security/testShortcut.js';
import { cameThroughDoor, doorUsable, isFromAnotherComputer } from '../webOs/door.js';
import { addressForUrl } from '../tailnet/addresses.js';
import { syncTailnetListener } from '../tailnet/listener.js';
import { nearbyCopies } from '../tailnet/nearby.js';
import { readTailnetSettings, writeTailnetSettings } from '../tailnet/settings.js';
import { dropVisitorSockets, endDeviceSignIns, rememberDeviceSignIn } from '../tailnet/signIns.js';
import { tailnetStatus } from '../tailnet/status.js';
import { isOwnTailnetHost, tailnetIsOn, visitingDevice } from '../tailnet/visit.js';

const log = createLogger('tailnet');
export const tailnetPublicRouter = express.Router();
export const tailnetRouter = express.Router();

const canManage = (req) => req.session?.userRole === 'admin' || isJestRun();

async function ownerRow(settings) {
  if (settings.ownerId == null) return null;
  const { rows } = await pool.query('SELECT id, email, name, role FROM users WHERE id = $1', [settings.ownerId]);
  return rows[0]?.role === 'admin' ? rows[0] : null;
}

tailnetPublicRouter.get('/hello', async (req, res) => {
  if (!cameThroughDoor(req) || !tailnetIsOn()) return res.status(404).json({ error: 'Not found.' });
  const [status, device] = await Promise.all([tailnetStatus(), visitingDevice(req)]);
  // Names are only told to a tailnet device that asked this computer by its own Tailscale address.
  if (!device || !isOwnTailnetHost(req.headers?.host, status)) return res.status(404).json({ error: 'Not found.' });
  res.json({
    app: 'censaiOS',
    name: status.self?.name || '',
    device: device.name,
    admitted: Boolean(req.tailnetDevice && req.tailnetDevice.id === device.id),
  });
});

tailnetPublicRouter.post('/enter', authSecurityRateLimiter, async (req, res) => {
  const device = req.tailnetDevice;
  if (!device || !tailnetIsOn()) {
    return res.status(403).json({ error: 'This device is not switched on in My Tailscale devices.', notSwitchedOn: true });
  }
  if (!dbReady()) {
    res.setHeader('Retry-After', '2');
    return res.status(503).json({ error: 'censaiOS is still starting, please try again in a moment.' });
  }
  try {
    const owner = await ownerRow(readTailnetSettings());
    if (!owner) {
      return res.status(409).json({ error: 'On the computer that runs censaiOS, turn My Tailscale devices off and on again.' });
    }
    await establishAuthenticatedSession(req, owner);
    rememberDeviceSignIn(req, device);
    log.info('tailnet: a switched-on device signed in', { deviceId: device.id, userId: owner.id });
    res.json({ ok: true, user: { id: owner.id, name: owner.name }, device: device.name });
  } catch (error) {
    log.error('tailnet sign-in failed', { code: safeErrorCode(error) });
    res.status(500).json({ error: 'Could not sign this device in.' });
  }
});

async function cardFor(req) {
  // The list of the owner's devices is the owner's to see.
  if (!canManage(req)) return { usable: doorUsable(), canManage: false, on: false, devices: [] };
  const settings = readTailnetSettings();
  const status = await tailnetStatus();
  const listener = await syncTailnetListener();
  const here = cameThroughDoor(req) ? await visitingDevice(req) : null;
  const address = status.connected ? status.self.addresses.find((item) => !item.includes(':')) : '';
  return {
    usable: doorUsable(),
    on: settings.on,
    connected: status.connected,
    reason: status.reason,
    thisComputer: status.self ? { name: status.self.name, dnsName: status.self.dnsName } : null,
    address: address && listener.port ? `http://${addressForUrl(address)}:${listener.port}` : '',
    portProblem: listener.problem,
    canManage: canManage(req),
    fromAnotherComputer: isFromAnotherComputer(req),
    devices: status.devices.map((device) => ({
      id: device.id,
      name: device.name,
      system: device.system,
      kind: device.kind,
      online: device.online,
      mine: device.mine,
      owner: device.owner,
      shared: device.tagged,
      on: Boolean(settings.devices[device.id]),
      here: here?.id === device.id,
    })),
  };
}

tailnetRouter.get('/', async (req, res) => {
  try {
    res.json(await cardFor(req));
  } catch (error) {
    log.warn('tailnet card failed', { code: safeErrorCode(error) });
    res.status(500).json({ error: 'Could not read your Tailscale devices.' });
  }
});

tailnetRouter.put('/', async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Only the owner of this censaiOS can change this.' });
  if (!doorUsable()) return res.status(409).json({ error: 'This censaiOS already lives at its own web address.' });
  try {
    const status = await tailnetStatus({ maxAgeMs: 3000 });
    const known = new Map(status.devices.map((device) => [device.id, device]));
    const wanted = req.body?.devices && typeof req.body.devices === 'object' ? Object.entries(req.body.devices) : [];
    // Only a device Tailscale lists right now can be switched on.
    const allow = wanted.filter(([id, on]) => on === true && known.has(id)).map(([id]) => ({ id, name: known.get(id).name }));
    const refuse = wanted.filter(([, on]) => on === false).map(([id]) => String(id));
    const patch = { allow, refuse };
    if (typeof req.body?.on === 'boolean') {
      patch.on = req.body.on;
      // A switched-on device opens censaiOS as whoever turned this on.
      if (req.body.on && req.session?.userId != null) patch.ownerId = req.session.userId;
    }
    writeTailnetSettings(patch);
    // Switched off means out now: its sign-ins end and its open pages close.
    // The pages close once this answer is sent, so an owner who switches off
    // the very device they are holding still sees that it worked.
    if (patch.on === false) {
      await endDeviceSignIns();
      res.once('finish', () => dropVisitorSockets());
    } else if (refuse.length) {
      await endDeviceSignIns(refuse);
      const addresses = refuse.flatMap((id) => known.get(id)?.addresses || []);
      res.once('finish', () => dropVisitorSockets(addresses));
    }
    log.info('tailnet: settings changed', { on: readTailnetSettings().on, switchedOn: allow.length, switchedOff: refuse.length, by: req.session?.userId ?? null });
    res.json(await cardFor(req));
  } catch (error) {
    log.error('tailnet settings not saved', { code: safeErrorCode(error) });
    res.status(500).json({ error: 'Could not save the setting.' });
  }
});

tailnetRouter.get('/nearby', async (req, res) => {
  // A page opened from another computer is already on the other copy.
  // `watching: false` tells the board to stop asking: nothing will show here.
  if (!tailnetIsOn() || !canManage(req) || isFromAnotherComputer(req)) return res.json({ copies: [], watching: false });
  try {
    res.json({ copies: await nearbyCopies({ fresh: req.query?.fresh === '1' }), watching: true });
  } catch (error) {
    log.warn('tailnet nearby failed', { code: safeErrorCode(error) });
    res.json({ copies: [], watching: true });
  }
});
