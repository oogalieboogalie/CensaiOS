// server/security/publicAddress.js
//
// Which addresses the server may call for someone, shared by outside tool
// servers (server/outsideTools/netGuard.js) and hosted agents
// (server/hostedAgents/netGuard.js). Where this computer's own files are
// closed to the app (the hosted cloud, or a private server that did not turn
// local files on) an address must be on the public internet. On the desktop
// app the owner may use servers on this computer (localhost).
//
// A name is looked up once and checked, and the connection then goes to that
// exact address (pinned). A name that answers a public address to the check
// and a private one a moment later (DNS rebinding) gets nowhere.

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { localFilesystemAllowed } from '../middleware/runtimeMode.js';
import { pinnedFetch as pinnedHttpFetch, pinnedLookup } from './pinnedHttp.js';

export { pinnedLookup };

/** True when this run may call this computer and its network. One rule for every guard. */
export function privateAddressesAllowed() {
  return localFilesystemAllowed();
}

/** The eight 16-bit groups of an IPv6 address ("::" filled in, a trailing a.b.c.d folded in). */
function ipv6Groups(ip) {
  let text = ip.split('%')[0];
  const dotted = text.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, -dotted[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail = ''] = text.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const fill = text.includes('::') ? Array(8 - front.length - back.length).fill('0') : [];
  return [...front, ...fill, ...back].map((group) => parseInt(group, 16));
}

export function isPrivateAddress(address) {
  const ip = String(address).replace(/^\[|\]$/g, '');
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
      // Reserved: 192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15, 198.51.100.0/24, 203.0.113.0/24.
      || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
  }
  if (net.isIPv6(ip)) {
    const g = ipv6Groups(ip.toLowerCase());
    // An IPv4 address inside an IPv6 one (::ffff:7f00:1 is 127.0.0.1) gets the IPv4 rule.
    const inner = (hi, lo) => isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) return inner(g[6], g[7]);
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return inner(g[6], g[7]);
    if (g[0] === 0x2002) return inner(g[1], g[2]);
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
  }
  return false;
}

/** Every address a host name points at (the name itself when it is already an address). */
export async function addressesOf(host, resolve = lookup) {
  const bare = String(host).replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) return [bare];
  return (await resolve(bare, { all: true }).catch(() => [])).map((r) => r.address);
}

/** Looks the host up once: { addresses, blocked } (blocked = the first private one), or { missing: true }. */
export async function vetHost(host, { resolve = lookup } = {}) {
  const addresses = await addressesOf(host, resolve);
  if (!addresses.length) return { missing: true, addresses, blocked: null };
  return { addresses, blocked: addresses.find(isPrivateAddress) || null };
}

/** A fetch that connects only to `addresses` and never follows a redirect. */
export function pinnedFetch(addresses) {
  return (url, init = {}) => pinnedHttpFetch(new URL(url), init, addresses);
}

/**
 * fetch for calls that may be pinned: with `pinnedAddresses` in init it
 * connects only to those, otherwise it is the ordinary fetch.
 */
export function netFetch(url, init = {}) {
  const { pinnedAddresses, ...rest } = init;
  return pinnedAddresses ? pinnedHttpFetch(new URL(url), rest, pinnedAddresses) : globalThis.fetch(url, rest);
}
