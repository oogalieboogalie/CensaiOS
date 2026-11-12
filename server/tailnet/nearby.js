// Other copies of censaiOS on the same tailnet. With "My Tailscale devices"
// on, this computer asks each device that is online whether censaiOS answers
// there, so the board can offer "censaiOS is open on officepc: open it".
//
// Only addresses Tailscale itself listed are asked, only on the one port
// censaiOS uses for other devices, and only a short hello is read back.

import http from 'node:http';
import { addressForUrl, isTailnetIpv4 } from './addresses.js';
import { cleanLabel } from './parse.js';
import { tailnetStatus } from './status.js';
import { tailnetPortNumber } from './listener.js';

const HELLO_PATH = '/api/web-os/tailnet/hello';
const ASK_TIMEOUT_MS = 1500;
const KEEP_MS = 3 * 60 * 1000;
const FRESH_GAP_MS = 10 * 1000;
const MAX_DEVICES = 40;
const MAX_ANSWER_BYTES = 4096;

let cache = { at: 0, copies: [] };
let pending = null;
let ask = askOverHttp;

function askOverHttp(address, port, from) {
  return new Promise((resolve) => {
    // Sent from this computer's own Tailscale address, so the other copy
    // sees which device is asking and the question never leaves the tailnet
    // (with Tailscale off, nothing is sent at all). Inside Docker that
    // address belongs to the box, which sends it that way by itself.
    const localAddress = process.env.CENSAI_IN_CONTAINER === '1' ? undefined : from;
    const req = http.get({
      host: address, port, path: HELLO_PATH, timeout: ASK_TIMEOUT_MS, localAddress,
      headers: { accept: 'application/json', host: `${addressForUrl(address)}:${port}` },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
        if (text.length > MAX_ANSWER_BYTES) req.destroy();
      });
      res.on('end', () => {
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      });
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(null));
  });
}

function toCopy(device, address, port, answer) {
  if (!answer || answer.app !== 'censaiOS') return null;
  return {
    id: device.id,
    name: cleanLabel(answer.name) || device.name,
    device: device.name,
    address: `http://${addressForUrl(address)}:${port}`,
    // False: censaiOS is there, but this computer is not switched on in its list.
    ready: answer.admitted === true,
  };
}

async function look() {
  const status = await tailnetStatus();
  if (!status.connected) return [];
  const port = tailnetPortNumber();
  const from = status.self.addresses.find(isTailnetIpv4);
  if (!from) return [];
  const online = status.devices.filter((device) => device.online && device.kind === 'computer').slice(0, MAX_DEVICES);
  const found = await Promise.all(online.map(async (device) => {
    const address = device.addresses.find(isTailnetIpv4);
    if (!address) return null;
    return toCopy(device, address, port, await ask(address, port, from));
  }));
  return found.filter(Boolean);
}

/**
 * censaiOS copies on the tailnet. Looked up at most every three minutes for
 * the pop-up; `fresh` (the owner opened the list in Settings) looks again,
 * but never more than once in ten seconds.
 */
export async function nearbyCopies({ now = Date.now(), fresh = false } = {}) {
  if (now - cache.at <= (fresh ? FRESH_GAP_MS : KEEP_MS)) return cache.copies;
  if (!pending) {
    pending = look()
      .then((copies) => { cache = { at: Date.now(), copies }; return copies; }, () => [])
      .finally(() => { pending = null; });
  }
  return pending;
}

/** Tests answer for the other computers. `null` puts the real asking back. */
export function setNearbyAsker(fn) {
  ask = fn || askOverHttp;
  cache = { at: 0, copies: [] };
  pending = null;
}
