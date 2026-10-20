/**
 * Open anywhere (web OS): the owner's switch that lets other computers on the
 * home network open this copy of censaiOS by its address, for example
 * http://officepc:3002 or http://192.168.1.23:3002.
 *
 * With the switch on, a browser request is allowed when its Origin is the
 * same address the request was sent to (Host) and that address is a home
 * network name or private IP. Requiring one of those names keeps a public
 * web page from reaching this server through a DNS trick (rebinding): a
 * public site's name is never a single word, .local, or a private IP.
 *
 * Settings live in .homebase-state/web-os.json, next to the Docker volume.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getRuntimeMode, RUNTIME_MODES } from '../middleware/runtimeMode.js';

const FILE_NAME = 'web-os.json';
const DEFAULTS = Object.freeze({ open: false, address: '' });
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const LAN_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.internal'];

let cached = null;

function stateDir(env = process.env) {
  return env.HOMEBASE_STATE_DIR || path.resolve(process.cwd(), '.homebase-state');
}

function cleanAddress(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/[/:].*$/, '').slice(0, 120);
}

export function readDoorSettings({ env = process.env, fresh = false } = {}) {
  if (cached && !fresh) return cached;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir(env), FILE_NAME), 'utf8'));
    cached = { open: raw.open === true, address: cleanAddress(raw.address) };
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

export function writeDoorSettings(patch = {}, { env = process.env } = {}) {
  const current = readDoorSettings({ env });
  const next = {
    open: typeof patch.open === 'boolean' ? patch.open : current.open,
    address: patch.address === undefined ? current.address : cleanAddress(patch.address),
  };
  const dir = stateDir(env);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, FILE_NAME), JSON.stringify(next, null, 2), 'utf8');
  cached = next;
  return next;
}

export function resetDoorCache() {
  cached = null;
}

function hostnameOf(host) {
  const value = String(host || '').trim().toLowerCase();
  if (value.startsWith('[')) return value.slice(0, value.indexOf(']') + 1);
  return value.split(':')[0];
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    // Tailscale and other carrier-grade NAT addresses (100.64.0.0/10).
    || (a === 100 && b >= 64 && b <= 127);
}

/** A name or address that only means something on a home network. */
export function isHomeNetworkHostname(hostname) {
  const name = hostnameOf(hostname);
  if (!name || LOOPBACK.has(name)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return isPrivateIpv4(name);
  if (name.startsWith('[')) return /^\[f[cd][0-9a-f]{2}:|^\[fe80:/.test(name);
  if (!/^[a-z0-9.-]+$/.test(name)) return false;
  if (!name.includes('.')) return true;
  return LAN_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function originHost(origin) {
  try {
    const url = new URL(String(origin));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.host.toLowerCase();
  } catch {
    return '';
  }
}

/** Only a copy on the owner's own computer opens to the home network. */
export function doorUsable(runtimeMode = getRuntimeMode()) {
  return runtimeMode === RUNTIME_MODES.LOCAL_DESKTOP;
}

/**
 * True when the switch is on and the browser is on another computer at a
 * home-network address, asking the same address it loaded the page from.
 */
export function doorAllowsOrigin(origin, hostHeader, {
  settings = readDoorSettings(),
  runtimeMode = getRuntimeMode(),
} = {}) {
  if (!settings.open || !doorUsable(runtimeMode) || !origin) return false;
  const host = originHost(origin);
  if (!host || host !== String(hostHeader || '').trim().toLowerCase()) return false;
  return isHomeNetworkHostname(host);
}

// Every connection that arrives on the Open anywhere port (doorListener.js)
// carries this mark, so the server knows it came from another computer no
// matter what address or Host header the request claims.
const THROUGH_DOOR = Symbol('censai.throughDoor');

export function markThroughDoor(socket) {
  if (socket) socket[THROUGH_DOOR] = true;
  return socket;
}

export function cameThroughDoor(req) {
  return Boolean(req?.socket?.[THROUGH_DOOR]);
}

function isLoopbackAddress(address) {
  const value = String(address || '');
  return value === '::1' || /^(?:::ffff:)?127\.\d+\.\d+\.\d+$/.test(value);
}

/**
 * True when this request came from another computer. Those visitors sign in
 * with a code, never an email. In order:
 *  1. it came in through the Open anywhere port (the only way in from the
 *     network for the one-file install, whose main port is 127.0.0.1 only);
 *  2. a server started outside Docker on this computer sees the real address
 *     of whoever connects, so anything but this computer itself counts;
 *  3. a page opened by a home-network name that is not this copy's own
 *     APP_ORIGIN (a second guard for an old compose file).
 */
export function isFromAnotherComputer(req, { env = process.env, runtimeMode = getRuntimeMode() } = {}) {
  if (cameThroughDoor(req)) return true;
  const remote = req?.socket?.remoteAddress;
  if (runtimeMode === RUNTIME_MODES.LOCAL_DESKTOP && env.CENSAI_IN_CONTAINER !== '1'
    && remote && !isLoopbackAddress(remote)) return true;
  const host = String(req?.get?.('host') ?? req?.headers?.host ?? '').toLowerCase();
  if (!isHomeNetworkHostname(host)) return false;
  return originHost(env.APP_ORIGIN) !== host;
}

function insideDocker() {
  try {
    return fs.existsSync('/.dockerenv');
  } catch {
    return false;
  }
}

/** Names and addresses other computers might use to reach this one. */
export function candidateHosts({ env = process.env, settings = readDoorSettings() } = {}) {
  const hosts = [];
  const add = (value) => {
    const name = cleanAddress(value);
    if (name && !LOOPBACK.has(name) && !hosts.includes(name)) hosts.push(name);
  };
  add(settings.address);
  add(env.CENSAI_HOST_NAME);
  if (!insideDocker()) {
    add(os.hostname());
    for (const list of Object.values(os.networkInterfaces())) {
      for (const entry of list || []) {
        if (entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address)) add(entry.address);
      }
    }
  }
  return hosts.filter((name) => isHomeNetworkHostname(name));
}
