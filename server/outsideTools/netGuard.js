// server/outsideTools/netGuard.js
//
// Which web addresses an outside tool server may have. Anywhere: http or
// https only, no user:password in the address. On the hosted cloud version
// (and a private server that did not turn local files on) the address must
// also be on the public internet, so one person cannot point the server at
// its own private network; the connection is pinned to the address checked
// (server/security/publicAddress.js). On the desktop app, servers on this
// computer (localhost) are the common case and are allowed.

import { lookup } from 'node:dns/promises';
import { createLogger } from '../logger.js';
import { isPrivateAddress, pinnedFetch, privateAddressesAllowed, vetHost } from '../security/publicAddress.js';
import { OutsideToolError } from './httpClient.js';

export { isPrivateAddress };

const log = createLogger('outside-tools');

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

/** The checked address and, where private ones are refused, the host's vetted addresses. */
async function vet(value, { cloud = !privateAddressesAllowed(), resolve = lookup } = {}) {
  let url;
  try {
    url = parseServerUrl(value);
  } catch (error) {
    // The address itself is never logged: it may hold a key.
    log.warn('address refused: not a usable web address', { reason: error.message });
    throw error;
  }
  if (!cloud) return { url, addresses: null };
  const host = url.hostname;
  const { addresses, missing, blocked } = await vetHost(host, { resolve });
  if (missing) {
    log.warn('address refused: not found on the internet', { host });
    throw new OutsideToolError(`Could not find ${host} on the internet.`, 400);
  }
  if (blocked) {
    log.warn('address refused: private network', { host, address: blocked });
    throw new OutsideToolError('On a hosted or shared censaiOS, tool servers must be on the public internet.', 400);
  }
  return { url, addresses };
}

export async function assertReachableUrl(value, options) {
  return (await vet(value, options)).url;
}

/** { url, fetchImpl } for talking to a tool server: pinned to the checked address where that matters. */
export async function reachableFetch(value, options) {
  const { url, addresses } = await vet(value, options);
  return { url, fetchImpl: addresses ? pinnedFetch(addresses) : globalThis.fetch };
}
