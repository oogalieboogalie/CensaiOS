// Open anywhere (web OS): the client side of server/routes/webOs.js.

const PAIR_PARAM = 'pair';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/web-os${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || `Could not reach censaiOS (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const getOpenAnywhere = () => call('');
export const saveOpenAnywhere = (patch) => call('', { method: 'PUT', body: patch });
export const makePairCode = () => call('/pair', { method: 'POST', body: {} });

export async function redeemPairCode(code) {
  try {
    return await call('/pair/redeem', { method: 'POST', body: { code } });
  } catch (error) {
    // The server refuses the request outright when Open anywhere is off.
    if (error.status === 500 || error.status === 403) {
      error.message = 'This censaiOS is not open to other computers yet. On your main computer, turn on Settings, Open anywhere.';
    }
    throw error;
  }
}

/** The one-time code in a link like http://officepc:3004/?pair=abc. */
export function pairCodeFromUrl(location = globalThis.location) {
  try {
    return new URLSearchParams(location?.search || '').get(PAIR_PARAM) || '';
  } catch {
    return '';
  }
}

/**
 * Addresses another computer can type, built from the ones the server knows.
 * Other computers have their own port (3004 in docker-compose.yml); this
 * computer's own port (3002) answers this computer only.
 */
export function addressesFor(hosts = [], location = globalThis.location, doorPort = null) {
  const protocol = location?.protocol === 'https:' ? 'https:' : 'http:';
  const portNumber = doorPort || location?.port;
  const port = portNumber ? `:${portNumber}` : '';
  const list = [];
  if (location?.hostname && !LOOPBACK.has(location.hostname)) list.push(location.origin);
  for (const host of hosts) {
    const address = `${protocol}//${host}${port}`;
    if (!list.includes(address)) list.push(address);
  }
  return list;
}

export function pairLink(address, code) {
  return `${address.replace(/\/$/, '')}/?${PAIR_PARAM}=${encodeURIComponent(code)}`;
}

// The browser's own "Install app" offer, kept until the person asks for it.
let installOffer = null;
const listeners = new Set();

export function watchInstallOffer(win = globalThis.window) {
  if (!win?.addEventListener) return;
  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installOffer = event;
    listeners.forEach((fn) => fn(true));
  });
  win.addEventListener('appinstalled', () => {
    installOffer = null;
    listeners.forEach((fn) => fn(false));
  });
}

export function onInstallOffer(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canOfferInstall = () => Boolean(installOffer);

export async function installApp() {
  if (!installOffer) return false;
  const offer = installOffer;
  installOffer = null;
  await offer.prompt();
  const choice = await offer.userChoice.catch(() => null);
  listeners.forEach((fn) => fn(false));
  return choice?.outcome === 'accepted';
}

export function runningAsInstalledApp(win = globalThis.window) {
  try {
    return Boolean(win?.matchMedia?.('(display-mode: standalone)').matches || win?.navigator?.standalone);
  } catch {
    return false;
  }
}

/**
 * A small service worker: when the computer running censaiOS is off or out
 * of reach, the page shows a censaiOS screen instead of a browser error.
 * It never caches the app or any data, so updates always show at once.
 */
export function registerOfflineScreen(win = globalThis.window) {
  if (!win?.navigator?.serviceWorker || !win.isSecureContext || import.meta.env?.DEV) return;
  win.addEventListener('load', () => {
    win.navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
