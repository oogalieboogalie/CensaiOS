// server/hostedAgents/netGuard.js
//
// Where censaiOS may send a hosted agent's messages. Every vendor address
// passes through here before anything leaves this computer: the vendors' own
// addresses, a LangChain deployment address someone pasted (checked when it
// is tested, imported and on every message), an address override set for
// testing (HOSTED_*_BASE_URL) and the chat link ElevenLabs hands back.
//
// Same rule and same code as outside tool servers
// (server/security/publicAddress.js): on a hosted or shared censaiOS the
// address must be on the public internet, and the connection is pinned to
// the address that was checked, so nobody can use the server to reach this
// computer, the office network or the cloud's own settings service. Where
// this computer's own files are open to the app (the desktop app, or a
// private server that turned local files on), the owner may point at their
// own machine, like a LangGraph dev server on localhost.

import { lookup } from 'node:dns/promises';
import { createLogger } from '../logger.js';
import { privateAddressesAllowed, vetHost } from '../security/publicAddress.js';
import { HostedAgentError } from './errors.js';

const log = createLogger('hosted-agents');
const PROTOCOLS = new Set(['https:', 'http:', 'wss:', 'ws:']);

export function privateAddressRefusal(host) {
  return `censaiOS did not send this to ${host} because that address is inside a private network `
    + '(this computer, a home or office network, or the cloud\'s own settings service). '
    + 'On a hosted or shared censaiOS, hosted agents must be on the public internet so nobody can use the server to reach machines that are not theirs. '
    + 'To use a dev server on your own computer, run censaiOS on that computer.';
}

/**
 * Throws a HostedAgentError unless `value` may be reached from this run.
 * Returns { url, addresses }: the checked addresses to pin the connection
 * to, or null where private addresses are allowed and nothing is pinned.
 */
export async function vendorAddress(value, { label = 'The vendor', local = privateAddressesAllowed(), resolve = lookup } = {}) {
  let url;
  try { url = new URL(String(value || '')); } catch { url = null; }
  if (!url || !PROTOCOLS.has(url.protocol) || url.username || url.password) {
    log.warn('address refused: not a usable web address', { vendor: label });
    throw new HostedAgentError(`${label} gave an address censaiOS cannot use.`, 400, 'HOSTED_AGENT_BAD_ADDRESS');
  }
  if (local) return { url, addresses: null };
  const host = url.hostname;
  const { addresses, missing, blocked } = await vetHost(host, { resolve });
  if (missing) {
    log.warn('address refused: not found on the internet', { vendor: label, host });
    throw new HostedAgentError(`Could not find ${host} on the internet.`, 502, 'HOSTED_AGENT_UNREACHABLE');
  }
  if (blocked) {
    log.warn('address refused: private network', { vendor: label, host, address: blocked });
    throw new HostedAgentError(privateAddressRefusal(host), 400, 'HOSTED_AGENT_PRIVATE_ADDRESS');
  }
  return { url, addresses };
}

export async function assertVendorAddress(value, options) {
  return (await vendorAddress(value, options)).url;
}
