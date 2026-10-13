// Censai Video board state. The project settings are `videoDoc`; each clip is
// its own window field (`vc.<id>`), so two people trimming or adding
// different clips at once both keep their work after the CRDT sync.
//
//   videoDoc  { w, h, fps, bg }
//   vc.<id>   { track: 'v' | 't' | 'a', start, dur, in, volume, media?, text?, … , at }
//
// Times are seconds. `in` is where the clip starts inside its source file.
// Video and audio files stay in the browser that added them (IndexedDB);
// the board carries their name, length and a thumbnail. Pictures and titles
// live on the board, so everyone sees them.

import { newPartId, readParts } from '../office/officeParts.js';
import { TITLE_TEXT, VIDEO_BG } from './creativeColors.js';

export const CLIP_PART = 'vc';
export const MIN_CLIP = 0.1;

export const TRACKS = Object.freeze([
  { id: 't', label: 'Titles' },
  { id: 'v', label: 'Video' },
  { id: 'a', label: 'Audio' },
]);

export const TITLE_POSITIONS = Object.freeze({ center: 'Center', lower: 'Lower third', top: 'Top' });

export function clipKey(id) {
  return `${CLIP_PART}.${id}`;
}

export function makeVideoDoc({ w = 1280, h = 720, fps = 30, bg = VIDEO_BG } = {}) {
  return { videoDoc: { w, h, fps, bg } };
}

export function makeClip(track, fields = {}) {
  const base = { track, start: 0, dur: 4, in: 0, volume: 1, at: Date.now() };
  if (track === 't') return { ...base, text: 'Title', size: 72, color: TITLE_TEXT, pos: 'center', ...fields };
  return { ...base, ...fields };
}

export function readVideo(win = {}) {
  const meta = win.videoDoc || {};
  const clips = readParts(win, CLIP_PART);
  const ids = Object.keys(clips).sort((a, b) => clips[a].start - clips[b].start || (clips[a].at || 0) - (clips[b].at || 0));
  return { w: Number(meta.w) || 1280, h: Number(meta.h) || 720, fps: Number(meta.fps) || 30, bg: meta.bg || VIDEO_BG, clips, ids };
}

export const clipEnd = (c) => c.start + c.dur;

/** Length of the whole edit: the end of the last clip. */
export function duration(doc) {
  return doc.ids.reduce((m, id) => Math.max(m, clipEnd(doc.clips[id])), 0);
}

/** The clip playing on a track at time t: the latest-starting one that covers t. */
export function activeClip(doc, track, t) {
  let hit = null;
  for (const id of doc.ids) {
    const c = doc.clips[id];
    if (c.track === track && c.start <= t && t < clipEnd(c)) hit = id;
  }
  return hit;
}

/** Every clip covering time t on a track (titles can stack). */
export function activeClips(doc, track, t) {
  return doc.ids.filter((id) => doc.clips[id].track === track && doc.clips[id].start <= t && t < clipEnd(doc.clips[id]));
}

/** Where the next clip on a track goes: right after the last one. */
export function trackEnd(doc, track) {
  return doc.ids.reduce((m, id) => (doc.clips[id].track === track ? Math.max(m, clipEnd(doc.clips[id])) : m), 0);
}

export function addClipPatch(clip) {
  const id = newPartId('c');
  return { id, patch: { [clipKey(id)]: { ...clip, at: Date.now() } } };
}

/** Cut a clip in two at time t. Returns { id, patch } for the new right half, or null. */
export function splitPatch(doc, id, t) {
  const c = doc.clips[id];
  if (!c || t <= c.start + MIN_CLIP || t >= clipEnd(c) - MIN_CLIP) return null;
  const right = { ...c, start: t, in: (c.in || 0) + (t - c.start), dur: clipEnd(c) - t, at: Date.now() };
  const newId = newPartId('c');
  return { id: newId, patch: { [clipKey(id)]: { ...c, dur: t - c.start }, [clipKey(newId)]: right } };
}

/** The media length a clip may use, or Infinity for pictures and titles. */
export function sourceLength(c) {
  return c.media && (c.media.kind === 'video' || c.media.kind === 'audio') && c.media.dur ? c.media.dur : Infinity;
}

/** Drag a clip's left ('in') or right ('out') edge to time t. */
export function trimClip(c, edge, t) {
  const end = clipEnd(c);
  const len = sourceLength(c);
  if (edge === 'in') {
    const earliest = Number.isFinite(len) ? c.start - (c.in || 0) : -Infinity;
    const start = Math.min(end - MIN_CLIP, Math.max(0, earliest, t));
    return { ...c, start, in: Math.max(0, (c.in || 0) + (start - c.start)), dur: end - start };
  }
  const latest = Number.isFinite(len) ? c.start + (len - (c.in || 0)) : Infinity;
  return { ...c, dur: Math.max(MIN_CLIP, Math.min(latest, t) - c.start) };
}

/** Snap t to the nearest target within `tolerance` seconds. */
export function snap(t, targets, tolerance) {
  let best = t;
  let dist = tolerance;
  for (const x of targets) {
    const d = Math.abs(x - t);
    if (d < dist) { dist = d; best = x; }
  }
  return best;
}

/** A title's opacity at time t: a short fade in and out. */
export function titleAlpha(c, t, fade = 0.3) {
  const f = Math.min(fade, c.dur / 3);
  if (f <= 0) return 1;
  return Math.max(0, Math.min(1, (t - c.start) / f, (clipEnd(c) - t) / f));
}

/** "1:05.3" */
export function formatTime(t) {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
}

/** Fit a source of size sw × sh inside w × h (letterboxed). */
export function containRect(sw, sh, w, h) {
  if (!sw || !sh) return { x: 0, y: 0, w, h };
  const k = Math.min(w / sw, h / sh);
  return { x: (w - sw * k) / 2, y: (h - sh * k) / 2, w: sw * k, h: sh * k };
}
