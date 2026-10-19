// "Invite to this board": the client side of server/routes/boardInvites.js.

import { addressesFor, getOpenAnywhere } from '../webOs.js';
import { navigateToWorkspace } from '../workspace/shareLink.js';

const INVITE_PARAM = 'invite';
const CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || `Could not reach censaiOS (${res.status}).`);
    error.status = res.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}

export const inviteToBoard = (workspaceId, email = '') => call(
  `/api/workspaces/${encodeURIComponent(workspaceId)}/invites`,
  { method: 'POST', body: { email: String(email || '').trim() } },
);
export const myInvites = () => call('/api/invites/mine');
export const dismissInvite = (id) => call(`/api/invites/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: {} });
export const previewInvite = (code) => call(`/api/invites/preview?code=${encodeURIComponent(code)}`);
export const redeemInvite = (code, name) => call('/api/invites/redeem', { method: 'POST', body: { code, name } });

/** Marks the invite opened, then goes to its board. */
export async function openInvitedBoard(invite, go = navigateToWorkspace) {
  try {
    await call(`/api/invites/${encodeURIComponent(invite.id)}/open`, { method: 'POST', body: {} });
  } catch {
    // Going to the board matters more than the mark; it shows again next time.
  }
  return go(invite.workspaceId);
}

/** The one-time code in a link like http://192.168.1.50:3004/?invite=abc. */
export function inviteCodeFromUrl(location = globalThis.location) {
  try {
    const code = new URLSearchParams(location?.search || '').get(INVITE_PARAM) || '';
    return CODE_PATTERN.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function inviteLink(address, code) {
  return `${String(address).replace(/\/$/, '')}/?${INVITE_PARAM}=${encodeURIComponent(code)}`;
}

/**
 * The address other devices type to reach this censaiOS. A page opened by
 * its network address already is one. On this computer's own localhost it
 * is the Open anywhere address, which only works while that switch is on.
 */
export async function addressForOthers(location = globalThis.location, readDoor = getOpenAnywhere) {
  if (location?.hostname && !LOOPBACK.has(location.hostname)) return { address: location.origin, doorClosed: false };
  try {
    const door = await readDoor();
    const [address] = addressesFor(door.hosts || [], location, door.port);
    if (address) return { address, doorClosed: !door.open };
  } catch {
    // Fall through to this page's own address.
  }
  return { address: location?.origin || '', doorClosed: true };
}
