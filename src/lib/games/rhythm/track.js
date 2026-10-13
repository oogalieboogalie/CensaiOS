// "Your own track": the checks and charting for an audio file the player
// picks. The length is read from the file's header before anything is
// decoded, because a decoded track is about ten times the size of the file:
// a 56 MB hour-long MP3 used to balloon to 2.6 GB of memory before it was
// refused, which can freeze a computer that is short on memory or disk.
import { audioFeatures, chartFromFeatures } from './onsets.js';

export const MAX_FILE = 60 * 1024 * 1024;
export const MAX_SECONDS = 600;
// When the browser can't tell a file's length, only files small enough to be
// safe whatever their length get decoded.
export const MAX_UNKNOWN_FILE = 16 * 1024 * 1024;
const DIFFS = ['easy', 'normal', 'hard'];

/**
 * Read, check and chart a picked file. `probe(file)` resolves to its length
 * in seconds (or null when unknown); `decode(arrayBuffer)` resolves to an
 * AudioBuffer. Resolves to { ok: true, name, buffer, charts } or
 * { ok: false, note } with a plain-words reason.
 */
export async function readTrack(file, { probe, decode }) {
  if (file.size > MAX_FILE) return { ok: false, note: 'That file is over 60 MB. Try a shorter track.' };
  const seconds = await probe(file).catch(() => null);
  const tooLong = { ok: false, note: 'Tracks up to 10 minutes work best. Try a shorter one.' };
  if (Number.isFinite(seconds) && seconds > MAX_SECONDS) return tooLong;
  if (!Number.isFinite(seconds) && file.size > MAX_UNKNOWN_FILE) return { ok: false, note: "Couldn't tell how long that track is. Try an MP3 or WAV under 10 minutes." };
  let buffer;
  try {
    buffer = await decode(await file.arrayBuffer());
  } catch {
    return { ok: false, note: "Couldn't read that file. MP3, WAV, OGG and M4A work." };
  }
  if (buffer.duration > MAX_SECONDS) return tooLong;
  const features = audioFeatures(buffer);
  const charts = Object.fromEntries(DIFFS.map((d) => [d, chartFromFeatures(features, d)]));
  if (charts.normal.length < 8) return { ok: false, note: 'Could not find a clear beat in that track.' };
  return { ok: true, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), buffer, charts };
}

/** A file's length from its header, via a media element. Never decodes it. */
export function probeDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('audio');
    let timer = null;
    const done = (value) => {
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    timer = setTimeout(() => done(null), 5000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}
