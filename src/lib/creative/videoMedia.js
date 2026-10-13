// Browser side of Censai Video media: read a picked file into a clip's
// media record (length, size, thumbnail, audio peaks) and store the file.
import { newPartId } from '../office/officeParts.js';
import { putMedia } from './mediaStore.js';

const MAX_PICTURE_EDGE = 1920;

function waitFor(el, event) {
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const bad = () => { cleanup(); reject(new Error('This browser cannot play that file. Try WebM, MP4 (H.264), MP3, WAV or OGG.')); };
    const cleanup = () => { el.removeEventListener(event, ok); el.removeEventListener('error', bad); };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener('error', bad, { once: true });
  });
}

async function videoInfo(url) {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  await waitFor(v, 'loadeddata');
  const dur = Number.isFinite(v.duration) ? v.duration : 0;
  v.currentTime = Math.min(1, dur / 3);
  await waitFor(v, 'seeked').catch(() => {});
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = Math.round((160 * (v.videoHeight || 9)) / (v.videoWidth || 16));
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return { dur, w: v.videoWidth, h: v.videoHeight, thumb: c.toDataURL('image/jpeg', 0.7) };
}

/** Peak levels (0..1) across a file, for drawing its waveform on the clip. */
export function peaksOf(channel, count = 240) {
  const out = [];
  const step = Math.max(1, Math.floor(channel.length / count));
  for (let i = 0; i < count; i += 1) {
    let peak = 0;
    for (let j = i * step; j < Math.min(channel.length, (i + 1) * step); j += 1) peak = Math.max(peak, Math.abs(channel[j]));
    out.push(Math.round(peak * 100) / 100);
  }
  return out;
}

async function audioInfo(file, url) {
  const a = document.createElement('audio');
  a.preload = 'auto';
  a.src = url;
  await waitFor(a, 'loadedmetadata');
  let peaks = null;
  try {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(1, 1, 44100);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    peaks = peaksOf(buf.getChannelData(0));
  } catch {
    peaks = null;
  }
  return { dur: Number.isFinite(a.duration) ? a.duration : 0, peaks };
}

async function pictureInfo(file, url) {
  const img = new Image();
  img.src = url;
  await waitFor(img, 'load');
  const k = Math.min(1, MAX_PICTURE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const png = file.type === 'image/png' && c.width * c.height < 800 * 800;
  return { w: c.width, h: c.height, src: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88) };
}

/** A picked file → { track, media, dur } ready to become a clip. */
export async function readMediaFile(file) {
  const kind = /^video\//.test(file.type) ? 'video' : /^audio\//.test(file.type) ? 'audio' : /^image\//.test(file.type) ? 'image' : null;
  if (!kind) throw new Error('Add a video, audio or picture file.');
  const name = String(file.name || kind).replace(/\.[a-z0-9]+$/i, '');
  const url = URL.createObjectURL(file);
  try {
    if (kind === 'image') {
      const info = await pictureInfo(file, url);
      return { track: 'v', dur: 4, media: { kind, name, ...info } };
    }
    const id = newPartId('m');
    const info = kind === 'video' ? await videoInfo(url) : await audioInfo(file, url);
    await putMedia(id, file);
    return { track: kind === 'video' ? 'v' : 'a', dur: info.dur || 4, media: { id, kind, name, type: file.type, ...info } };
  } finally {
    URL.revokeObjectURL(url);
  }
}
