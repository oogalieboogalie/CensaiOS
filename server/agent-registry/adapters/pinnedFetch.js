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

function pinnedLookup(addresses) {
  const resolved = addresses.map(item => ({
    address: item.address,
    family: Number(item.family) || familyOf(item.address),
  }));
  return (_hostname, options, callback) => {
    if (options?.all) callback(null, resolved);
    else callback(null, resolved[0].address, resolved[0].family);
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
