// Turns a pasted Twitch or YouTube link into a player address the Stream
// Viewer can show. Covers the links people copy: Twitch channels (with or
// without a trailing "/") and past broadcasts (/videos/<id>), YouTube watch,
// youtu.be, live and Shorts links. Anything else is shown as pasted.
import { twitchPlayerUrl, withTwitchParent } from './twitchEmbed.js';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;

function asUrl(text) {
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
}

function youtubeEmbed(id) {
  return YOUTUBE_ID.test(id || '') ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
}

function fromYouTube(url) {
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') return youtubeEmbed(url.pathname.split('/')[1]);
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (first === 'embed') return url.toString();
  if (first === 'watch') return youtubeEmbed(url.searchParams.get('v'));
  if (first === 'live' || first === 'shorts') return youtubeEmbed(second);
  return null;
}

function fromTwitch(url) {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host === 'player.twitch.tv') return withTwitchParent(url.toString());
  if (host !== 'twitch.tv') return null;
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (first === 'videos' && /^\d+$/.test(second || '')) {
    const player = new URL(twitchPlayerUrl('x'));
    player.searchParams.delete('channel');
    player.searchParams.set('video', second);
    return player.toString();
  }
  return first && /^[A-Za-z0-9_]{1,25}$/.test(first) ? twitchPlayerUrl(first.toLowerCase()) : null;
}

export function parseStreamUrl(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const url = asUrl(raw);
  if (!url) return raw;
  return fromTwitch(url) || fromYouTube(url) || raw;
}
