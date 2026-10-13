import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';
import { getRuntimeMode, RUNTIME_MODES } from '../../middleware/runtimeMode.js';
import { A2AAdapterError } from './a2aCard.js';
import { pinnedFetch } from './pinnedFetch.js';

const DENIED_HOSTS = new Set([
  'localhost', 'metadata.google.internal', 'metadata.google',
]);

export function isRestrictedNetworkAddress(address) {
  const value = String(address || '').toLowerCase().split('%')[0];
  if (!ipaddr.isValid(value)) return true;
  const parsed = ipaddr.parse(value);
  if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() !== 'unicast';
  }
  return parsed.range() !== 'unicast';
}

function externalError(message, suffix, statusCode) {
  const error = new Error(message);
  error.name = 'ExternalAdapterError';
  error.code = `EXTERNAL_${suffix}`;
  error.statusCode = statusCode;
  return error;
}

function a2aError(message, suffix, statusCode) {
  return new A2AAdapterError(message, `A2A_${suffix}`, statusCode);
}

function parseUrl(input, errorFactory) {
  let url;
  try { url = new URL(String(input || '')); }
  catch { throw errorFactory('External agent URL is invalid.', 'URL_INVALID', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw errorFactory('External agent URL must be HTTP(S) without embedded credentials.',
      'URL_INVALID', 400);
  }
  url.hash = '';
  return url;
}

async function resolveExternalEgressUrl(input, {
  mode = getRuntimeMode(),
  lookup = dns.lookup,
  errorFactory = externalError,
} = {}) {
  const url = parseUrl(input, errorFactory);
  const local = mode === RUNTIME_MODES.LOCAL_DESKTOP;
  if (!local && url.protocol !== 'https:') {
    throw errorFactory('External agents require HTTPS outside local desktop mode.',
      'HTTPS_REQUIRED', 403);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!local && (DENIED_HOSTS.has(hostname) || hostname.endsWith('.localhost'))) {
    throw errorFactory('External agent target is blocked by egress policy.',
      'EGRESS_DENIED', 403);
  }
  let addresses;
  if (ipaddr.isValid(hostname)) {
    addresses = [{ address: hostname }];
  } else {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw errorFactory('External agent hostname could not be resolved.',
      'DNS_FAILED', 422); }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw errorFactory('External agent hostname resolved to no addresses.', 'DNS_FAILED', 422);
  }
  if (!local && addresses.some((entry) => isRestrictedNetworkAddress(entry.address))) {
    throw errorFactory('External agent target is blocked by egress policy.',
      'EGRESS_DENIED', 403);
  }
  return { url, addresses };
}

export async function assertExternalEgressUrl(input, options = {}) {
  return (await resolveExternalEgressUrl(input, options)).url;
}

export function createExternalGuardedFetch({
  mode = getRuntimeMode(), lookup = dns.lookup, fetchImpl, errorFactory = externalError,
} = {}) {
  return async (input, init = {}) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const target = await resolveExternalEgressUrl(isRequest ? input.url : input, {
      mode, lookup, errorFactory,
    });
    const safeInit = { ...init, redirect: 'manual' };
    return typeof fetchImpl === 'function'
      ? fetchImpl(target.url, safeInit)
      : pinnedFetch(target.url, safeInit, target.addresses);
  };
}

export async function assertA2AEgressUrl(input, options = {}) {
  return assertExternalEgressUrl(input, { ...options, errorFactory: a2aError });
}

export function createA2AGuardedFetch({
  mode = getRuntimeMode(), lookup = dns.lookup, fetchImpl,
} = {}) {
  return createExternalGuardedFetch({ mode, lookup, fetchImpl, errorFactory: a2aError });
}
