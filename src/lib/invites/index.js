// "Invite to this board": the client side of server/routes/boardInvites.js.

import { getOpenAnywhere } from '../webOs.js';
import { readShareBase } from '../workspace/shareBase.js';
import { navigateToWorkspace } from '../workspace/shareLink.js';
import { chooseInviteAddress } from './inviteAddress.js';

const INVITE_PARAM = 'invite';
const CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

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
/** One tap: invite someone you already share a board with, by their id. */
export const invitePerson = (workspaceId, personId) => call(
  `/api/workspaces/${encodeURIComponent(workspaceId)}/invites`,
  { method: 'POST', body: { personId } },
);
export const knownPeople = () => call('/api/invites/people').then((d) => d.people || []);
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
 * The address other people open this board at. A saved board address
 * (Share, "Links start with") wins. Otherwise a page that is already public,
 * or the Open anywhere port when that port is listening. The desktop app's
 * own name is never used: that port answers this computer only.
 */
export async function addressForOthers(location = globalThis.location, readDoor = getOpenAnywhere, readBase = readShareBase) {
  const shareBase = readBase();
  const saved = chooseInviteAddress({ location, shareBase });
  if (saved.address) return saved;
  let door;
  try { door = await readDoor(); } catch { door = null; }
  return chooseInviteAddress({ location, door, shareBase });
}
