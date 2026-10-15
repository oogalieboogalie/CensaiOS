// Turns the page into the try-it board before the app boots: /api calls are
// answered in the browser, live sockets never connect, and absolute asset
// paths are moved under the folder the demo is served from (/try/).
import { DEMO } from './demoMode.js';
import { demoResponse } from './demoApi.js';

const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/$/, '');

function pathOf(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url || '';
}

function sameOriginPath(raw) {
  try {
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin ? url.pathname + url.search : null;
  } catch { return null; }
}

/** A socket that never opens: the board has no server to talk to. */
class QuietSocket extends EventTarget {
  constructor(url) { super(); this.url = String(url); this.readyState = 0; }
  send() {}
  close() { this.readyState = 3; }
}
QuietSocket.CONNECTING = 0; QuietSocket.OPEN = 1; QuietSocket.CLOSING = 2; QuietSocket.CLOSED = 3;

export function installDemo() {
  if (!DEMO || typeof window === 'undefined' || window.__censaiDemo) return;
  window.__censaiDemo = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const local = sameOriginPath(pathOf(input));
    if (local && (local.startsWith('/api/') || local.startsWith(`${BASE}/api/`))) {
      const path = local.startsWith(BASE + '/api/') ? local.slice(BASE.length) : local;
      const req = typeof input === 'object' && !(input instanceof URL) ? input : null;
      return demoResponse(path, { method: init?.method || req?.method, body: init?.body });
    }
    if (BASE && local && !local.startsWith(`${BASE}/`) && typeof input === 'string' && input.startsWith('/')) {
      return realFetch(BASE + input, init);
    }
    return realFetch(input, init);
  };
  const RealSocket = window.WebSocket;
  window.WebSocket = function DemoSocket(url, protocols) {
    const local = sameOriginPath(String(url).replace(/^ws/, 'http'));
    return local ? new QuietSocket(url) : new RealSocket(url, protocols);
  };
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket.prototype = RealSocket.prototype;
  // Each visit starts fresh: the welcome windows glide in again.
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('censai.boardWakeUp')) localStorage.removeItem(key);
    }
  } catch { /* private mode */ }
}

installDemo();
