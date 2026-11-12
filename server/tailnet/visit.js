// Who is knocking? Decides whether a request from another computer comes
// from a Tailscale device the owner switched on ("My Tailscale devices").
//
// The far end of the connection is the proof: Tailscale only delivers a
// packet from a 100.x address when it came from the device holding that
// address, so nothing a visitor types or sends in a header counts here.

import { doorUsable, setOwnAddressRule } from '../webOs/door.js';
import { hostNameOf, isTailnetAddress, plainAddress } from './addresses.js';
import { NOT_RECOGNISED, NOT_SWITCHED_ON, WRONG_ADDRESS, notSwitchedOnPage, wrongAddressPage } from './closedPage.js';
import { readTailnetSettings } from './settings.js';
import { lastTailnetStatus, tailnetStatus } from './status.js';

// Connections that arrived on the Tailscale-only port (listener.js). On that
// port nobody gets in with a code: a device is switched on, or it is refused.
const TAILNET_PORT = Symbol('censai.tailnetPort');
const NOBODY = Object.freeze({ admitted: false, tailnetOnly: false, device: null });

export function markTailnetPort(socket) {
  if (socket) socket[TAILNET_PORT] = true;
  return socket;
}

export function cameOnTailnetPort(req) {
  return Boolean(req?.socket?.[TAILNET_PORT]);
}

export function tailnetIsOn(settings = readTailnetSettings()) {
  return doorUsable() && settings.on === true;
}

function refused(device, tailnetOnly) {
  return {
    admitted: false,
    tailnetOnly,
    device,
    page: notSwitchedOnPage(device?.name),
    message: device ? NOT_SWITCHED_ON : NOT_RECOGNISED,
    // Lets another censaiOS on the tailnet say "switch this computer on
    // over there" instead of finding nothing.
    hint: { app: 'censaiOS', tailnet: device ? 'not-switched-on' : 'not-recognised' },
  };
}

// A switched-on device that asked for this computer under a name that is not
// its own Tailscale address. A web page elsewhere can point a name of its
// own at this computer; a browser on a switched-on device would then carry
// that page's requests here. Refusing the name stops it at the door.
function wrongAddress(device, tailnetOnly) {
  return { admitted: false, tailnetOnly, device, page: wrongAddressPage(), message: WRONG_ADDRESS, hint: { app: 'censaiOS', tailnet: 'wrong-address' } };
}

function deviceAt(status, address) {
  if (!status?.connected) return null;
  return status.devices.find((device) => device.addresses.includes(address)) || null;
}

async function lookUp(req) {
  const address = plainAddress(req?.socket?.remoteAddress);
  if (!isTailnetAddress(address)) return { device: null, status: null };
  let status = await tailnetStatus();
  let device = deviceAt(status, address);
  if (!device) {
    // A device that joined the tailnet a moment ago: ask once more.
    status = await tailnetStatus({ maxAgeMs: 3000 });
    device = deviceAt(status, address);
  }
  return { device, status };
}

/** The tailnet device at the far end of this connection, or null. */
export async function visitingDevice(req) {
  return (await lookUp(req)).device;
}

/**
 * @returns {object|Promise<object>} `{ admitted, tailnetOnly, device, page?, message?, hint? }`.
 * Answers at once (no promise) whenever Tailscale cannot be the reason to
 * let this request in, so the Open anywhere checks stay as they were.
 */
export function tailnetVisit(req) {
  const tailnetOnly = cameOnTailnetPort(req);
  const settings = readTailnetSettings();
  if (!tailnetIsOn(settings)) return tailnetOnly ? refused(null, true) : NOBODY;
  if (!isTailnetAddress(plainAddress(req?.socket?.remoteAddress))) return tailnetOnly ? refused(null, true) : NOBODY;
  return lookUp(req).then(({ device, status }) => {
    if (!device || !settings.devices[device.id]) return refused(device, tailnetOnly);
    if (!isOwnTailnetHost(req?.headers?.host, status)) return wrongAddress(device, tailnetOnly);
    return { admitted: true, tailnetOnly, device };
  }, () => refused(null, tailnetOnly));
}

/**
 * True when `host` (from a Host or Origin header) is one of this computer's
 * own Tailscale addresses: its 100.x address or its tailnet name. A page from
 * anywhere else is refused, which keeps a web site from reaching this
 * computer by pointing a name of its own at it.
 */
export function isOwnTailnetHost(host, status = lastTailnetStatus()) {
  const self = status?.self;
  const name = hostNameOf(host);
  // Nothing read yet (a write before any page load): ask now, refuse this once.
  if (!self) tailnetStatus().catch(() => {});
  if (!self || !name) return false;
  if (self.addresses.includes(plainAddress(name))) return true;
  if (!self.dnsName) return false;
  return name === self.dnsName || name === self.dnsName.split('.')[0];
}

setOwnAddressRule((host) => tailnetIsOn() && isOwnTailnetHost(host));
