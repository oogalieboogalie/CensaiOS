// server/outsideTools/netGuard.js
//
// Which web addresses an outside tool server may have. Anywhere: http or
// https only, no user:password in the address. On the hosted cloud version
// the address must also be on the public internet, so one person cannot point
// the server at its own private network. On the desktop app, servers on this
// computer (localhost) are the common case and are allowed.

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { isCloudRuntime } from '../middleware/runtimeMode.js';
import { OutsideToolError } from './httpClient.js';

export function parseServerUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch {
    throw new OutsideToolError('That is not a web address. It should start with https://', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new OutsideToolError('The address must start with https:// or http://', 400);
  }
  if (url.username || url.password) {
    throw new OutsideToolError('Put the key in the Key box, not inside the address.', 400);
  }
  return url;
}

export function isPrivateAddress(address) {
  const ip = String(address).replace(/^\[|\]$/g, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7));
    return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return false;
}

export async function assertReachableUrl(value, { cloud = isCloudRuntime(), resolve = lookup } = {}) {
  const url = parseServerUrl(value);
  if (!cloud) return url;
  const host = url.hostname;
  const addresses = net.isIP(host.replace(/^\[|\]$/g, ''))
    ? [host]
    : (await resolve(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!addresses.length) throw new OutsideToolError(`Could not find ${host} on the internet.`, 400);
  if (addresses.some(isPrivateAddress)) {
    throw new OutsideToolError('On the hosted version, tool servers must be on the public internet.', 400);
  }
  return url;
}
