// The share button's link, as the server published it. A localhost address
// is never one a guest can open, so it is not copied.

import { guestLinkUrl } from './shareLink.js';
import { isThisComputerOnly } from './shareBase.js';

export const PUBLIC_LINK_RETRY = 'Click Make link and copy again. This computer could not open a public address for this board.';
const ORIGIN_KEY = 'homebase.sharePublicOrigin.v1';

export function rememberPublishedOrigin(value) {
  try {
    const origin = new URL(String(value || '')).origin;
    if (isThisComputerOnly(new URL(origin))) return '';
    localStorage.setItem(ORIGIN_KEY, origin);
    return origin;
  } catch {
    return '';
  }
}

export function readPublishedOrigin() {
  try {
    const origin = localStorage.getItem(ORIGIN_KEY) || '';
    if (!origin || isThisComputerOnly(new URL(origin))) return '';
    return origin;
  } catch {
    return '';
  }
}

/** Full guest link for a token, or '' when this computer has no public address yet. */
export function publishedJoinUrl(token) {
  const origin = readPublishedOrigin();
  if (!origin) return '';
  return guestLinkUrl(token, { origin, pathname: '/' });
}
