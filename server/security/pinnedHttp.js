// server/security/pinnedHttp.js
//
// fetch() that connects only to addresses already checked (DNS pinning):
// the Host header and TLS name stay the real host name, the connection goes
// to the checked address, and redirects are never followed. Used by A2A
// cards (server/agent-registry/adapters/egress.js), outside tool servers and
// hosted agents (server/security/publicAddress.js).

import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';

function familyOf(address) {
  return ipaddr.parse(address).kind() === 'ipv6' ? 6 : 4;
}

function responseHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source || {})) {
    if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

function requestHeaders(source) {
  const headers = new Headers(source || {});
  headers.set('accept-encoding', 'identity');
  return Object.fromEntries(headers.entries());
}

/**
 * A dns.lookup stand-in that only ever answers the addresses already checked
 * (strings or { address, family }), so the connection cannot be re-pointed
 * by a second DNS answer.
 */
export function pinnedLookup(addresses) {
  const all = addresses.map((item) => {
    const address = typeof item === 'string' ? item : item.address;
    return { address, family: Number(item?.family) || familyOf(address) };
  });
  return (_hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    const opts = options && typeof options === 'object' ? options : {};
    const list = opts.family === 4 || opts.family === 6 ? all.filter((a) => a.family === opts.family) : all;
    if (!list.length) return done(Object.assign(new Error('No checked address for that family.'), { code: 'ENOTFOUND' }));
    if (opts.all) return done(null, list);
    return done(null, list[0].address, list[0].family);
  };
}

function writeBody(request, body) {
  if (body == null) return request.end();
  if (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    request.end(body);
    return;
  }
  request.destroy(new TypeError('External fetch body must be text or bytes.'));
}

export function pinnedFetch(url, init, addresses) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: init?.method || 'GET',
      headers: requestHeaders(init?.headers),
      signal: init?.signal,
      lookup: pinnedLookup(addresses),
      agent: false,
    }, response => {
      const status = response.statusCode || 500;
      const empty = init?.method === 'HEAD' || [204, 205, 304].includes(status);
      resolve(new Response(empty ? null : Readable.toWeb(response), {
        status,
        statusText: response.statusMessage || '',
        headers: responseHeaders(response.headers),
      }));
    });
    request.once('error', reject);
    writeBody(request, init?.body);
  });
}
