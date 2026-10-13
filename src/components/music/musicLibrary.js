// Pure helpers for the Music window's track lists and per-viewer settings.
//
// Two lists feed the device. The queue holds streamed links (YouTube,
// YouTube Music, Spotify, SoundCloud) and lives on the window record, so
// everyone on the board sees the same queue. The USB list holds audio files
// a person loaded from their own computer; those never leave that browser,
// so they play only for the person who added them.

export const QUEUE_LIMIT = 50;

const PREFS_KEY = 'censai.music';

export function readMusicPrefs() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeMusicPrefs(patch) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readMusicPrefs(), ...patch }));
  } catch {
    // Private windows and blocked storage just forget; playback still works.
  }
}

export function clampVolume(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 80;
  return Math.max(0, Math.min(100, n));
}

/** Queue entries are `{ url, title, source }`; anything else is dropped. */
export function normalizeQueue(queue) {
  if (!Array.isArray(queue)) return [];
  return queue
    .filter(item => item && typeof item.url === 'string' && item.url)
    .map(item => ({ url: item.url, title: String(item.title || item.url), source: String(item.source || 'generic') }))
    .slice(-QUEUE_LIMIT);
}

/** Add a track to the queue (moving it to the end if already there). */
export function addToQueue(queue, track) {
  const list = normalizeQueue(queue).filter(item => item.url !== track.url);
  list.push({ url: track.url, title: String(track.title || track.url), source: String(track.source || 'generic') });
  return list.slice(-QUEUE_LIMIT);
}

export function removeFromQueue(queue, url) {
  return normalizeQueue(queue).filter(item => item.url !== url);
}

/**
 * Index of the track `delta` steps from `current` in a list of `length`,
 * wrapping at both ends. Returns -1 for an empty list.
 */
export function stepTrack(length, current, delta) {
  if (!length) return -1;
  const from = current >= 0 && current < length ? current : (delta > 0 ? -1 : 0);
  return (((from + delta) % length) + length) % length;
}

/** Rough bitrate for the LCD readout, from file size and duration. */
export function estimateKbps(bytes, seconds) {
  if (!(bytes > 0) || !(seconds > 0)) return 0;
  const raw = (bytes * 8) / seconds / 1000;
  // WAV and FLAC are far above any MP3 rate; no "kbps" badge for those.
  if (raw > 400) return 0;
  const common = [32, 64, 96, 128, 160, 192, 256, 320];
  return common.reduce((best, k) => (Math.abs(k - raw) < Math.abs(best - raw) ? k : best), common[0]);
}

/** "01 Artist - Song.mp3" -> "Artist - Song". */
export function titleFromFileName(name) {
  const base = String(name || 'Untitled').replace(/\.[a-z0-9]{2,5}$/i, '');
  return base.replace(/^\d{1,3}[\s._-]+/, '').replace(/_/g, ' ').trim() || 'Untitled';
}

export function isAudioFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('audio/')) return true;
  return /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(file.name || '');
}
