import { logToApp } from '../../lib/appLog/browserLog.js';

// Plain song links (a .mp3 on a website) and internet radio streams play in
// the Music window's own audio player, like USB files, instead of a hidden
// web frame. These helpers tell such links apart from YouTube, Spotify and
// SoundCloud pages, and write the window's 'music' lines in the app log.

const SONG_FILE = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;
const RADIO_PATH = /(^|[/;_-])(stream|live|listen|radio|icecast|shoutcast)([/._-]|$)|-(32|48|64|96|128|160|192|256|320)-(mp3|aac|ogg)$/i;
const RADIO_HOST = /(^|\.)(icecast|shoutcast|streamtheworld|zeno\.fm|radio\.co|radiojar|somafm\.com|stream\.)|^(stream|radio|live|ice\d*|listen)\./i;
const EMBED_HOST = /(youtube\.com|youtu\.be|youtube-nocookie\.com|spotify\.com|soundcloud\.com)$/i;

function readUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/** Path with %XX turned back into characters. A stray % stays as written. */
function decodedPath(url, u) {
  const path = u.pathname || '/';
  try {
    return decodeURIComponent(path);
  } catch {
    logMusic('warn', `could not decode a link from ${linkHost(url)}`);
    return path;
  }
}

/**
 * 'song' or 'radio' when the address itself says so, 'embed' for a page we
 * already know how to frame, 'unknown' for any other http(s) link (the player
 * tries those), or null when it is not an http(s) link.
 */
export function guessLinkKind(url) {
  const u = readUrl(url);
  if (!u) return null;
  if (EMBED_HOST.test(u.hostname)) return 'embed';
  const path = decodedPath(url, u);
  if (SONG_FILE.test(path)) return 'song';
  if (RADIO_PATH.test(path) || RADIO_HOST.test(u.hostname)) return 'radio';
  return 'unknown';
}

/** 'song' for a direct audio file link, 'radio' for a radio stream, else null. */
export function directAudioKind(url) {
  const kind = guessLinkKind(url);
  return kind === 'song' || kind === 'radio' ? kind : null;
}

/** One app-log line when trying a link (not its address words) finds the kind. */
export function logTriedKind(url, kind) {
  logMusic('info', `found a ${kind} link by trying ${linkHost(url)}`);
}

/** Just the site's name, so a log line never carries a link's own words. */
export function linkHost(url) {
  return readUrl(url)?.hostname.replace(/^www\./, '') || 'a link';
}

export function logMusic(level, message) {
  logToApp(level, `music: ${message}`, { where: 'music' });
}
