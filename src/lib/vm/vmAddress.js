// VM windows: the pure parts, shared by the window and its tests. No DOM,
// no React, no noVNC.
//
// A VM window shows a virtual machine the person runs themselves, over VNC
// carried on a WebSocket (QEMU's built-in websocket, or websockify in front
// of any VNC server). What is shared on the window record as `win.vm`:
//   { host, port, path, secure, hostClientId, hostName, cast }
// The password is never on the record: it stays on the device that typed it.

export const DEFAULT_ADDRESS = Object.freeze({ host: 'localhost', port: 6080, path: '', secure: false });

const HOST = /^[A-Za-z0-9.-]{1,253}$|^\[[0-9A-Fa-f:.]{2,45}\]$/;
const PATH = /^[A-Za-z0-9._~!$&'()*+,;=:@%/?-]{0,200}$/;

function cleanPath(path) {
  const trimmed = String(path || '').trim().replace(/^\/+/, '');
  return PATH.test(trimmed) ? trimmed : null;
}

function cleanPort(value) {
  const port = Number(String(value ?? '').trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/**
 * Reads what someone typed into the address form. The host field also takes
 * a whole `ws://` or `wss://` URL (or `host:port`), which wins over the port
 * field. Returns `{ address }` or `{ error }` in plain words.
 */
export function parseAddress({ host = '', port = '', path = '', secure = false } = {}) {
  let text = String(host || '').trim();
  if (!text) return { error: 'Type the address of the computer running the VM.' };
  let address = { host: '', port: cleanPort(port), path: cleanPath(path), secure: Boolean(secure) };

  const scheme = /^([a-z]+):\/\//i.exec(text);
  if (scheme) {
    const kind = scheme[1].toLowerCase();
    if (kind === 'vnc') return { error: 'Browsers can’t open vnc:// directly. Put websockify in front of it and use its port (see “How do I expose a VM?”).' };
    if (!['ws', 'wss', 'http', 'https'].includes(kind)) return { error: `Use a ws:// or wss:// address, not ${kind}://.` };
    let url;
    try { url = new URL(text.replace(/^https?:/i, (m) => (m.toLowerCase() === 'https:' ? 'wss:' : 'ws:'))); } catch { return { error: 'That address doesn’t look right.' }; }
    address = {
      host: url.hostname,
      port: url.port ? cleanPort(url.port) : (url.protocol === 'wss:' ? 443 : 80),
      path: cleanPath(`${url.pathname}${url.search}`),
      secure: url.protocol === 'wss:',
    };
  } else {
    const hostPort = /^(\[[^\]]+\]|[^:/]+):(\d+)(\/.*)?$/.exec(text);
    if (hostPort) {
      text = hostPort[1];
      address.port = cleanPort(hostPort[2]);
      if (hostPort[3]) address.path = cleanPath(hostPort[3]);
    } else if (text.includes('/')) {
      const [first, ...rest] = text.split('/');
      text = first;
      address.path = cleanPath(rest.join('/'));
    }
    address.host = text;
  }

  if (!HOST.test(address.host)) return { error: 'That host name doesn’t look right.' };
  if (!address.port) return { error: 'Pick a port between 1 and 65535 (websockify often uses 6080).' };
  if (address.path === null) return { error: 'That path has characters a WebSocket address can’t carry.' };
  return { address };
}

/** A tidy, validated copy of a stored address, or null. */
export function normalizeAddress(value) {
  if (!value || typeof value !== 'object') return null;
  const { address } = parseAddress({ host: value.host, port: value.port, path: value.path, secure: value.secure });
  return address || null;
}

/** The WebSocket URL noVNC connects to. */
export function wsUrl(address) {
  const a = normalizeAddress(address);
  if (!a) return null;
  const defaultPort = a.secure ? 443 : 80;
  return `${a.secure ? 'wss' : 'ws'}://${a.host}${a.port === defaultPort ? '' : `:${a.port}`}/${a.path}`;
}

/** What people read: "localhost:6080", or with the path and a lock word. */
export function addressLabel(address) {
  const a = normalizeAddress(address);
  if (!a) return '';
  return `${a.host}:${a.port}${a.path ? `/${a.path}` : ''}`;
}

export function isLoopback(host) {
  const h = String(host || '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || /^127\./.test(h) || h === '[::1]';
}

/**
 * Something the browser will refuse before we even try, in plain words, or
 * null. An https page may only open wss:// sockets, except to this machine.
 */
export function blockedReason(address, pageProtocol = 'http:') {
  const a = normalizeAddress(address);
  if (!a) return null;
  if (pageProtocol === 'https:' && !a.secure && !isLoopback(a.host)) {
    return 'This page is on https, so the browser only allows secure (wss://) connections to other computers. Turn on “Secure”, or connect from the desktop app.';
  }
  return null;
}

/** Turns noVNC's disconnect and security events into one sentence. */
export function describeDrop({ clean, reason, status, wasConnected } = {}) {
  if (reason) {
    const text = String(reason).trim();
    if (/auth|password/i.test(text)) return 'The VM turned down that password.';
    return text.length > 160 ? `${text.slice(0, 159)}…` : text;
  }
  if (status !== undefined && status !== 0) return 'The VM turned down that password.';
  if (clean && wasConnected) return 'The VM closed the connection.';
  if (wasConnected) return 'The connection to the VM dropped.';
  return 'Couldn’t reach a VNC WebSocket at that address. Check that the VM is running and the port is the websocket one (often 6080 or 5700), not plain VNC (5900).';
}

/** "Alex is using this VM", or "You are using this VM". */
export function driverLine(vm, { self = false } = {}) {
  if (!vm?.hostClientId) return '';
  return self ? 'You are using this VM' : `${vm.hostName || 'Someone'} is using this VM`;
}

// Short how-tos for the connect form. Kept here so the docs and tests agree.
export const EXPOSE_HELP = Object.freeze([
  {
    id: 'qemu',
    title: 'QEMU',
    body: 'QEMU can serve VNC over a WebSocket by itself. Then connect to port 5700.',
    command: 'qemu-system-x86_64 -m 4G -enable-kvm -drive file=disk.qcow2 -vnc :0,websocket=5700',
  },
  {
    id: 'websockify',
    title: 'Any VNC server with websockify',
    body: 'websockify turns a plain VNC port (5900 and up) into a WebSocket. Then connect to port 6080.',
    command: 'qemu-system-x86_64 -m 4G -drive file=disk.qcow2 -vnc :1\nwebsockify 6080 localhost:5901',
  },
  {
    id: 'virtualbox',
    title: 'VirtualBox',
    body: 'Turn on its VNC server (needs the VNC extension pack), then put websockify in front of it and connect to port 6080.',
    command: 'VBoxManage setproperty vrdeextpack VNC\nVBoxManage modifyvm "My VM" --vrde on --vrde-port 5901 --vrde-property VNCPassword=choose-one\nwebsockify 6080 localhost:5901',
  },
]);

// Passwords stay on this device, one per window, and only if asked to.
export const PASSWORD_KEY = 'censai.vm.passwords';

export function readSavedPassword(storage, windowId) {
  try {
    const all = JSON.parse(storage?.getItem(PASSWORD_KEY) || '{}');
    const value = all && typeof all === 'object' ? all[String(windowId)] : null;
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function savePassword(storage, windowId, password) {
  try {
    const parsed = JSON.parse(storage?.getItem(PASSWORD_KEY) || '{}');
    const all = parsed && typeof parsed === 'object' ? parsed : {};
    if (password) all[String(windowId)] = String(password);
    else delete all[String(windowId)];
    storage?.setItem(PASSWORD_KEY, JSON.stringify(all));
  } catch {
    // Private windows and blocked storage just forget.
  }
}

/**
 * The record patch for `win.vm`. Strips anything that isn't part of the
 * shared shape, so a password can never ride along by accident.
 */
export function vmRecord(vm) {
  const address = normalizeAddress(vm);
  if (!address) return null;
  return {
    ...address,
    hostClientId: typeof vm.hostClientId === 'string' ? vm.hostClientId.slice(0, 120) : null,
    hostName: typeof vm.hostName === 'string' ? vm.hostName.slice(0, 80) : '',
    cast: vm.cast !== false,
  };
}

// Typing text into the VM, for VMs that ignore the VNC clipboard (plain QEMU
// does). X keysyms: Latin-1 maps to itself, other characters to 0x1000000 +
// their code point, and a few keys have names.
const NAMED_KEYS = Object.freeze({ '\n': 0xff0d, '\r': null, '\t': 0xff09 });
export const MAX_TYPED_CHARS = 4000;

export function keysymsFor(text) {
  const out = [];
  for (const char of String(text || '').slice(0, MAX_TYPED_CHARS)) {
    if (char in NAMED_KEYS) {
      if (NAMED_KEYS[char]) out.push(NAMED_KEYS[char]);
      continue;
    }
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f) continue;
    out.push(code <= 0xff ? code : 0x1000000 + code);
  }
  return out;
}
