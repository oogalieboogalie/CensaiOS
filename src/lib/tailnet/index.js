// "My Tailscale devices": the client side of server/routes/tailnet.js.

import { workspaceShareLink } from '../workspace/shareLink.js';

const DISMISSED_KEY = 'homebase.tailnet.dismissed.v1';

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/web-os/tailnet${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || `Could not reach censaiOS (${res.status}).`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const getTailnet = () => call('');
export const saveTailnet = (patch) => call('', { method: 'PUT', body: patch });
/** `fresh`: look again now (Settings), instead of the answer kept for the pop-up. */
export const getNearbyCopies = ({ fresh = false } = {}) => call(fresh ? '/nearby?fresh=1' : '/nearby');
export const tailnetHello = () => call('/hello');
export const enterFromTailnet = () => call('/enter', { method: 'POST', body: {} });

/** Why Tailscale devices can't be listed yet, in plain words. */
export function whyNotConnected(reason) {
  switch (reason) {
    case 'not-installed':
      return 'Tailscale is not on this computer yet. Install it from tailscale.com, sign in, then come back here.';
    case 'needs-feed':
      return 'censaiOS runs in Docker here, so it can\'t see Tailscale by itself. On this box, run: bash scripts/home-server-tailnet.sh';
    case 'docker-desktop':
      return 'censaiOS runs in Docker Desktop here. Docker Desktop hides which device is connecting, so censaiOS can\'t tell your Tailscale devices apart and lets none in. Use the censaiOS desktop app on this computer, or a Linux home server.';
    case 'stale-feed':
      return 'The list of your Tailscale devices on this box has stopped updating. On the box, run: bash scripts/home-server-tailnet.sh';
    case 'no-answer':
      return 'Tailscale did not answer. Check that it is running on this computer.';
    default:
      return 'Tailscale is on this computer but signed out. Open Tailscale, sign in, then come back here.';
  }
}

/** The link that opens one board at this computer's Tailscale address. */
export function boardLinkAt(address, workspaceId) {
  const base = `${String(address || '').replace(/\/$/, '')}/`;
  if (!address) return '';
  return (workspaceId && workspaceShareLink(workspaceId, { href: base })) || base;
}

function tauriInvoke(win) {
  return win?.__TAURI__?.core?.invoke || win?.__TAURI_INTERNALS__?.invoke || null;
}

/**
 * Opens another copy of censaiOS found on the tailnet. The installed desktop
 * app switches itself to that computer (it restarts to do so); a browser
 * opens it in a new tab.
 * @returns {Promise<'desktop'|'tab'>}
 */
export async function openCopy(copy, win = globalThis.window) {
  const invoke = tauriInvoke(win);
  if (invoke) {
    try {
      const info = await invoke('server_get');
      if (info?.available) {
        await invoke('server_save', { mode: 'remote', address: copy.address });
        return 'desktop';
      }
    } catch {
      // Not the installed app after all: fall through to a tab.
    }
  }
  // No 'noopener' flag here: with it, open() answers null even when the tab
  // opened, and this page would then leave the board for no reason.
  const opened = win?.open?.(copy.address, '_blank');
  if (opened) opened.opener = null;
  else win?.location?.assign?.(copy.address);
  return 'tab';
}

export function dismissedCopies(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(DISMISSED_KEY) || '[]');
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export function dismissCopy(id, storage = globalThis.localStorage) {
  try {
    const next = [...new Set([...dismissedCopies(storage), String(id)])].slice(-50);
    storage?.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // Private mode: it simply shows again next time.
  }
}
