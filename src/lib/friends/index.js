// Friends: the client side of server/routes/friends.js.

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`/api/web-os/friends${path}`, {
    method,
    credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Party-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || `Could not reach censaiOS (${res.status}).`);
    error.status = res.status;
    error.code = data?.code || '';
    throw error;
  }
  return data;
}

export const getFriends = () => call('');
export const saveFriends = (patch) => call('', { method: 'PUT', body: patch });
export const addFriend = (code) => call('', { method: 'POST', body: { code } });
export const removeFriend = (id) => call(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const shareWithFriend = (id, { workspaceId, role }) => call(`/${encodeURIComponent(id)}/party`, { method: 'POST', body: { workspaceId, role } });
export const stopSharing = (partyId) => call(`/party/${encodeURIComponent(partyId)}`, { method: 'DELETE' });

/**
 * Opens a friend's board in this computer's browser. A browser opens a new
 * tab; the installed app has no tabs, so it asks the computer to.
 * @returns {Promise<boolean>} false when nothing opened (a blocked pop-up).
 */
export async function openBoard(url, win = globalThis.window) {
  const invoke = win?.__TAURI__?.core?.invoke || win?.__TAURI_INTERNALS__?.invoke;
  try {
    if (invoke) {
      await invoke('open_in_system_browser', { url });
      return true;
    }
    return Boolean(win?.open?.(url, '_blank'));
  } catch {
    return false;
  }
}

/**
 * True when the browser that will open a friend's board is, or may be,
 * Safari. A friend's board opens under a name ending in ".localhost", made
 * for that one share, and Safari has no way to look such a name up. In a
 * browser this reads the browser itself; the installed app on a Mac opens
 * the computer's own browser, which is Safari unless the person changed it.
 */
export function mayNotOpenFriendBoards(win = globalThis.window) {
  const agent = String(win?.navigator?.userAgent || '');
  const inApp = Boolean(win?.__TAURI__ || win?.__TAURI_INTERNALS__);
  if (inApp) return /Macintosh|Mac OS X/.test(agent);
  return /Safari\//.test(agent) && !/(Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Android)/.test(agent);
}

/**
 * Joins a friend's board and, once their censaiOS has answered, opens it.
 * @returns the card, plus `opened`: false when the board has to be opened by hand.
 */
export async function joinBoard(code, win = globalThis.window) {
  const data = await call('/joins', { method: 'POST', body: { code } });
  return { ...data, opened: data.joined?.url ? await openBoard(data.joined.url, win) : false };
}
export const leaveBoard = (joinId) => call(`/joins/${encodeURIComponent(joinId)}`, { method: 'DELETE' });
// On a friend's board: both ask for the party's password from the party code.
export const partyHello = (token) => call('/party/hello', { token });
export const enterParty = (token) => call('/party/enter', { method: 'POST', body: {}, token });

/** 'friend', 'party' or '' from the first characters, so one box takes both codes. */
export function kindOfCode(text) {
  const code = String(text || '').trim();
  if (code.startsWith('cf1-')) return 'friend';
  if (code.startsWith('cp1-')) return 'party';
  return '';
}

export async function copyText(text, nav = globalThis.navigator) {
  try {
    await nav?.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}
