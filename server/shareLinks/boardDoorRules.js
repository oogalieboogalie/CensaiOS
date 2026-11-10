// What the public board door may serve. The door is a second listener the
// share button publishes. It is a door to one shared board, not to the
// machine: no owner app, no one-click sign-in, no keys, no vault.

const JOIN = /(?:^|[?&])join=([A-Za-z0-9_-]{43})(?:&|$)/;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'tauri.localhost']);
const LAN_SUFFIX = ['.local', '.lan', '.home', '.internal', '.home.arpa'];

export const PUBLIC_LINK_FAILED = 'Click Make link and copy again. This computer could not open a public address for this board.';

function hostnameOf(host) {
  const value = String(host || '').trim();
  if (!value) return '';
  try { return new URL(`http://${value}`).hostname.toLowerCase(); } catch { return ''; }
}

function isPrivateIp(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

/** True when a guest off this network can open this host in a browser. */
export function hostIsReachableByAnyone(host) {
  const name = hostnameOf(host);
  if (!name || LOCAL.has(name) || isPrivateIp(name) || !name.includes('.')) return false;
  return !LAN_SUFFIX.some((suffix) => name.endsWith(suffix));
}

export function originFromRequest(req) {
  const host = String(req?.headers?.host || req?.get?.('host') || '').split(',')[0].trim();
  if (!hostIsReachableByAnyone(host)) return '';
  const proto = String(req?.headers?.['x-forwarded-proto'] || req?.protocol || 'https').split(',')[0].trim();
  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

/** The link the share button copies. Localhost is never a published link. */
export function boardLink(origin, token) {
  const url = new URL(String(origin || ''));
  if (!hostIsReachableByAnyone(url.host) || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    const error = new Error(PUBLIC_LINK_FAILED);
    error.statusCode = 503;
    error.code = 'PUBLIC_LINK_UNAVAILABLE';
    throw error;
  }
  if (!JOIN.test(`?join=${token}`)) {
    const error = new Error('That share link is not valid.');
    error.statusCode = 400;
    throw error;
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  url.searchParams.set('join', token);
  return url.toString();
}

const GUEST_API = [/^\/api\/guest(\/|$)/, /^\/api\/auth\/session$/, /^\/api\/health$/];
const GUEST_SOCKET = [/^\/hocuspocus$/, /^\/ws\/workspace-collaboration$/];

/**
 * @returns {boolean} whether this request may pass through the board door.
 * Anything else is the rest of the machine and stays shut.
 */
export function boardDoorAllows({ method = 'GET', path = '/', search = '' } = {}) {
  const pathname = String(path || '/');
  const query = String(search || '');
  if (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/session') return false;
  if (/^\/api\/(keys|vault|workspaces)(\/|$)/.test(pathname)) return false;
  if (/^\/api\/invites(\/|$)/.test(pathname)) return false;
  if (GUEST_SOCKET.some((rule) => rule.test(pathname))) return /(?:^|[?&])guest=1(?:&|$)/.test(query);
  if (pathname.startsWith('/api/')) return GUEST_API.some((rule) => rule.test(pathname));
  const verb = String(method || 'GET').toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD') return false;
  if (pathname === '/' || pathname === '/index.html') return JOIN.test(query.startsWith('?') ? query : `?${query}`);
  return pathname.startsWith('/assets/');
}

/** Host the upstream app should see, so the guest's browser matches the cookie. */
export function publicHostFrom(req) {
  const forwarded = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = String(req?.headers?.host || '').split(',')[0].trim();
  if (hostIsReachableByAnyone(forwarded)) return forwarded;
  if (hostIsReachableByAnyone(host)) return host;
  return host;
}
