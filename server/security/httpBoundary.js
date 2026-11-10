import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function normalizedOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return String(value || '').replace(/\/$/, '');
  }
}

function browserUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.username || url.password) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());
}

// The host as written. URL.hostname folds 2130706433, 0x7f.1 and 127.1 into
// 127.0.0.1, and those spellings are not this machine's name.
function rawHttpHost(value) {
  const match = /^https?:\/\/([^/?#]*)/i.exec(String(value || '').trim());
  if (!match) return null;
  const authority = match[1];
  if (!authority || authority.includes('@')) return null;
  if (authority.startsWith('[')) {
    const end = authority.indexOf(']');
    if (end <= 1) return null;
    const rest = authority.slice(end + 1);
    if (rest && !/^:\d+$/.test(rest)) return null;
    return authority.slice(0, end + 1).toLowerCase();
  }
  const colon = authority.lastIndexOf(':');
  if (colon >= 0 && /^\d+$/.test(authority.slice(colon + 1))) {
    return authority.slice(0, colon).toLowerCase();
  }
  if (authority.includes(':')) return null;
  return authority.toLowerCase();
}

function hostWasRewritten(value) {
  const raw = rawHttpHost(value);
  const url = browserUrl(value);
  // A host the URL parser accepts but we cannot read as written (a backslash,
  // a missing slash, a stray @) was rewritten into something else.
  if (!raw) return Boolean(url);
  if (!url) return false;
  return raw !== String(url.hostname || '').toLowerCase();
}

export function originHasUserinfo(value) {
  try {
    const url = new URL(String(value));
    return Boolean(url.username || url.password);
  } catch {
    return false;
  }
}

// Origin to compare, or '' when userinfo or a rewritten host makes it unusable.
export function statedBrowserOrigin(value) {
  if (originHasUserinfo(value) || hostWasRewritten(value)) return '';
  const url = browserUrl(value);
  return url ? url.origin.toLowerCase() : '';
}

// localhost, 127.0.0.1 and [::1] are one origin when the scheme and port are
// the same. A different port, scheme, or any other name stays different.
function isLoopbackTwinOrigin(origin, configuredOrigin) {
  const request = browserUrl(origin);
  const configured = browserUrl(configuredOrigin);
  if (!request || !configured) return false;
  if (hostWasRewritten(origin) || hostWasRewritten(configuredOrigin)) return false;
  if (request.protocol !== configured.protocol || request.port !== configured.port) return false;
  return isLoopbackHost(rawHttpHost(origin)) && isLoopbackHost(rawHttpHost(configuredOrigin));
}

const DEV_LOCAL_HOST = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

// Same Host allow-list as the HTTP DNS-rebinding guard.
export function isAllowedRequestHost(host, {
  appOrigin,
  apiOrigin,
  nodeEnv = process.env.NODE_ENV,
  doorOk = false,
} = {}) {
  if (doorOk) return true;
  const normalized = String(Array.isArray(host) ? host.join(',') : (host ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\/$/, '');
  if (!normalized || normalized.includes(',')) return false;
  for (const raw of [appOrigin, apiOrigin]) {
    if (!raw) continue;
    let url;
    try { url = new URL(String(raw)); } catch { continue; }
    if (url.username || url.password) continue;
    if (normalized === url.host.toLowerCase()) return true;
    for (const alias of loopbackHostAliases(url)) {
      if (normalized === alias.toLowerCase()) return true;
    }
  }
  return nodeEnv !== 'production' && DEV_LOCAL_HOST.test(normalized);
}

export function loopbackHostAliases(url) {
  if (!url || !isLoopbackHost(url.hostname)) return [];
  const port = url.port;
  return ['localhost', '127.0.0.1', '[::1]'].map((host) => (port ? `${host}:${port}` : host));
}

/**
 * Extra origins the owner listed for a home network, e.g.
 * CENSAI_LAN_ORIGINS=http://officepc:3002 so a laptop can open the PC's copy.
 */
export function lanOrigins(env = process.env) {
  return String(env.CENSAI_LAN_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizedOrigin);
}

// The origin a browser will send for this setting. An expanded IPv6 address
// or other non-canonical spelling still matches that. Userinfo is not stripped.
export function configuredBrowserOrigin(value) {
  try {
    const url = new URL(String(value));
    if (url.username || url.password) return '';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin.toLowerCase();
  } catch {
    return '';
  }
}

export function isAllowedBrowserOrigin(origin, {
  appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173',
  runtimeMode = getRuntimeMode(),
  extraOrigins = lanOrigins(),
} = {}) {
  if (!origin) return true;
  if (originHasUserinfo(origin) || hostWasRewritten(origin)) return false;
  const stated = statedBrowserOrigin(origin);
  const configured = configuredBrowserOrigin(appOrigin);
  if (stated && configured && stated === configured) return true;
  if (isLoopbackTwinOrigin(origin, appOrigin)) return true;
  if (runtimeMode !== RUNTIME_MODES.LOCAL_DESKTOP) return false;
  if (extraOrigins.includes(normalizedOrigin(origin))) return true;
  // The desktop shell (Windows uses http://tauri.localhost; other systems
  // use tauri://localhost). Any other localhost port is a different page.
  const desktop = normalizedOrigin(origin);
  if (desktop === 'http://tauri.localhost' || desktop === 'https://tauri.localhost') return true;
  return String(origin).startsWith('tauri://');
}

export function getProxyTrustSetting(env = process.env) {
  const raw = String(env.CENSAI_TRUST_PROXY_HOPS || '').trim();
  // Google Cloud Run always puts exactly one front end before the app and
  // sets K_SERVICE; trust that one hop unless the owner set a value.
  if (!raw) return env.K_SERVICE ? 1 : false;
  if (raw === '0') return false;
  if (!/^\d+$/.test(raw)) {
    throw new Error('CENSAI_TRUST_PROXY_HOPS must be an integer from 0 to 10.');
  }
  const hops = Number(raw);
  if (hops < 1 || hops > 10) {
    throw new Error('CENSAI_TRUST_PROXY_HOPS must be an integer from 0 to 10.');
  }
  return hops;
}
