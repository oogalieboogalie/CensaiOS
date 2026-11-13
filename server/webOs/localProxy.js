// A reverse proxy on this same computer (Tailscale Funnel, or Caddy/nginx
// beside the app) connects to 127.0.0.1. The desktop app listens there on
// purpose. Without this check the proxy would look like the owner, and
// one-click sign-in would be offered on the public address. A Funnel
// visitor often has no Tailscale-User-Login. X-Forwarded-For,
// X-Forwarded-Proto, or a host other than localhost still count.

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function header(req, name) {
  const wanted = name.toLowerCase();
  const headers = req?.headers;
  if (headers && typeof headers === 'object') {
    const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
    if (key) return String(headers[key] ?? '').trim();
  }
  // Host is the one header callers stub with get(). Other names stay absent
  // unless they were actually sent, so a stub that answers every get() with
  // the host is not mistaken for a proxy.
  if (wanted !== 'host') return '';
  const fromGet = req?.get?.('host');
  return fromGet ? String(fromGet).trim() : '';
}

function hostnameOf(host) {
  const value = String(host || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0];
}

function lastHop(value) {
  const parts = String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function isLoopbackSocket(req) {
  const value = String(req?.socket?.remoteAddress || '');
  return value === '::1' || /^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(value);
}

/**
 * True when this loopback connection was made by a local reverse proxy,
 * not by the owner's own browser on localhost.
 */
export function cameThroughLocalProxy(req) {
  if (!isLoopbackSocket(req)) return false;
  if (header(req, 'tailscale-user-login')) return true;
  if (header(req, 'x-forwarded-for') || header(req, 'x-forwarded-proto')) return true;
  const host = hostnameOf(header(req, 'host'));
  return Boolean(host) && !LOOPBACK_HOSTS.has(host);
}

/**
 * The origin a browser on the proxied address sends, when it matches the
 * host the proxy presented. A foreign site's origin does not match.
 */
export function proxyBrowserOriginAllowed(req, origin) {
  if (!isLoopbackSocket(req) || !origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const presented = hostnameOf(lastHop(header(req, 'x-forwarded-host')) || header(req, 'host'));
  if (!presented || LOOPBACK_HOSTS.has(presented)) return false;
  return presented === url.hostname.toLowerCase();
}
