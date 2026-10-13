// The address a share link starts with. By default it is the address this
// browser is using, which is right on a server or when people reach the
// install over the network. On the desktop app or http://localhost that
// address only works on this computer, so the owner can set the address
// other people reach this censaiOS at (their domain, network address or
// tunnel). It is kept in this browser only; no server or hosting needed.

import { guestLinkUrl } from './shareLink.js';

export const SHARE_BASE_KEY = 'homebase.shareBase.v1';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'tauri.localhost']);

export function isThisComputerOnly(locationLike = globalThis.location) {
  const protocol = String(locationLike?.protocol || '');
  if (protocol && protocol !== 'http:' && protocol !== 'https:') return true;
  return LOCAL_HOSTS.has(String(locationLike?.hostname || '').toLowerCase());
}

/** Normalize what the owner typed into an origin + path, or '' if it isn't a web address. */
export function cleanShareBase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
  } catch {
    return '';
  }
}

export function readShareBase() {
  try { return cleanShareBase(localStorage.getItem(SHARE_BASE_KEY)); } catch { return ''; }
}

export function writeShareBase(value) {
  const clean = cleanShareBase(value);
  try {
    if (clean) localStorage.setItem(SHARE_BASE_KEY, clean);
    else localStorage.removeItem(SHARE_BASE_KEY);
  } catch { /* storage unavailable: links use this browser's address */ }
  return clean;
}

/** The full guest link for a token, using the saved address when there is one. */
export function shareLinkFor(token, locationLike = globalThis.location) {
  const base = readShareBase();
  if (!base) return guestLinkUrl(token, locationLike);
  const url = new URL(base);
  return guestLinkUrl(token, { origin: url.origin, pathname: url.pathname });
}
