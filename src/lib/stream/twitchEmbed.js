// Twitch's player only plays inside a page whose address it was told about
// (the `parent` parameter). The Stream Viewer used to always say
// "localhost", so Twitch refused whenever the board was opened any other
// way: the desktop app's own address, a laptop, Open anywhere. These helpers
// name the board's real host instead, at the moment the player is shown, so
// a stream saved on one machine still plays when the board is opened on
// another.

const TWITCH_PLAYER = 'https://player.twitch.tv/';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function currentLocation() {
  return typeof window === 'undefined' ? null : window.location;
}

/** The host names to hand Twitch: this page's host, and localhost as a fallback. */
export function twitchParents(location = currentLocation()) {
  const host = String(location?.hostname || '').trim().toLowerCase();
  return [...new Set([host, 'localhost'].filter(Boolean))];
}

export function twitchPlayerUrl(channel, location = currentLocation()) {
  const url = new URL(TWITCH_PLAYER);
  url.searchParams.set('channel', channel);
  for (const parent of twitchParents(location)) url.searchParams.append('parent', parent);
  return url.toString();
}

export function isTwitchPlayer(src) {
  try { return new URL(src).hostname === 'player.twitch.tv'; } catch { return false; }
}

/** A saved Twitch player address, re-pointed at the page it's shown on now. */
export function withTwitchParent(src, location = currentLocation()) {
  if (!isTwitchPlayer(src)) return src;
  const url = new URL(src);
  url.searchParams.delete('parent');
  for (const parent of twitchParents(location)) url.searchParams.append('parent', parent);
  return url.toString();
}

/**
 * Why Twitch may refuse to play on this page, or null. Twitch only embeds
 * on https pages, apart from localhost.
 */
export function twitchRefusalReason(location = currentLocation()) {
  const host = String(location?.hostname || '').toLowerCase();
  if (!host) return null;
  if (LOCAL_HOSTS.has(host)) return null;
  if (location?.protocol === 'https:') return null;
  return `Twitch only plays on https addresses or localhost, and this board is open at ${location?.protocol || ''}//${location?.host || host}.`;
}
