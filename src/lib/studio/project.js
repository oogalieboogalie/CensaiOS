import { normalizeEffect, newEffect } from './effects.js';
import { normalizeSynth } from './dsp/synth.js';
import { DIVISIONS } from './dsp/util.js';
import { SCALE_NAMES } from './musicKey.js';

// The Studio project as saved on the window record (win.studio). Positions
// are in beats (quarter notes) so changing the tempo keeps everything on
// the grid; audio clips keep their length in seconds. Audio itself is not
// in here, only each file's name, length and a coarse waveform: the sound
// stays in the browser that added it (see assetStore.js).

export const MAX_TRACKS = 16;
export const MAX_CLIPS = 64;
export const MAX_NOTES = 512;
export const SNAPS = Object.freeze(['off', '1/1', '1/2', '1/4', '1/8', '1/16', '1/32']);
export const TRACK_COLORS = Object.freeze(['cyan', 'violet', 'amber', 'green', 'rose', 'blue']);

const n = (v, lo, hi, fb) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.min(hi, Math.max(lo, +v)) : fb);
const str = (v, fb, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fb);
let idCounter = 0;
export const newId = prefix => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Snap step in beats, or 0 for no snap. */
export function snapBeats(snap) {
  if (snap === 'off') return 0;
  return snap === '1/1' ? 4 : DIVISIONS[snap] ?? 0.25;
}

function normalizeClip(c, kind) {
  if (!c || typeof c !== 'object') return null;
  const base = { id: str(c.id, newId('clip')), start: n(c.start, 0, 4096, 0), name: str(c.name, '') };
  if (kind === 'synth') {
    const len = n(c.len, 0.25, 256, 4);
    const notes = (Array.isArray(c.notes) ? c.notes : []).slice(0, MAX_NOTES).map(x => ({
      p: Math.round(n(x?.p, 0, 127, 60)), t: n(x?.t, 0, len, 0), d: n(x?.d, 1 / 32, 64, 0.25), v: n(x?.v, 0.05, 1, 0.8),
    }));
    return { ...base, kind: 'midi', len, notes };
  }
  return {
    ...base, kind: 'audio', asset: str(c.asset, ''), offset: n(c.offset, 0, 36000, 0), dur: n(c.dur, 0.01, 36000, 1),
    gain: n(c.gain, -60, 12, 0), fadeIn: n(c.fadeIn, 0, 10, 0), fadeOut: n(c.fadeOut, 0, 10, 0),
  };
}

export function normalizeTrack(t, i = 0) {
  const kind = t?.kind === 'synth' ? 'synth' : 'audio';
  return {
    id: str(t?.id, `track-${i}`),
    name: str(t?.name, kind === 'synth' ? `Synth ${i + 1}` : `Audio ${i + 1}`, 32),
    kind,
    color: TRACK_COLORS.includes(t?.color) ? t.color : TRACK_COLORS[i % TRACK_COLORS.length],
    gain: n(t?.gain, -60, 6, 0),
    pan: n(t?.pan, -1, 1, 0),
    mute: Boolean(t?.mute), solo: Boolean(t?.solo), arm: kind === 'audio' && Boolean(t?.arm),
    fx: (Array.isArray(t?.fx) ? t.fx : []).map(normalizeEffect).filter(Boolean).slice(0, 8),
    clips: (Array.isArray(t?.clips) ? t.clips : []).map(c => normalizeClip(c, kind)).filter(Boolean).slice(0, MAX_CLIPS),
    synth: kind === 'synth' ? normalizeSynth(t?.synth) : undefined,
  };
}

function normalizeAssets(a) {
  const out = {};
  if (!a || typeof a !== 'object') return out;
  Object.entries(a).slice(0, 64).forEach(([id, v]) => {
    out[id] = {
      name: str(v?.name, 'Audio', 80), dur: n(v?.dur, 0, 36000, 0),
      peaks: (Array.isArray(v?.peaks) ? v.peaks : []).slice(0, 512).map(p => Math.round(n(p, 0, 99, 0))),
      by: str(v?.by, '', 40),
    };
  });
  return out;
}

export function normalizeProject(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const tracks = (Array.isArray(p.tracks) ? p.tracks : []).slice(0, MAX_TRACKS).map(normalizeTrack);
  const loopStart = n(p.loop?.start, 0, 4096, 0);
  return {
    v: 1,
    title: str(p.title, 'Untitled song', 60),
    bpm: n(p.bpm, 30, 300, 120),
    beatsPerBar: Math.round(n(p.beatsPerBar, 2, 12, 4)),
    key: Math.round(n(p.key, 0, 11, 0)),
    scale: SCALE_NAMES.includes(p.scale) ? p.scale : 'major',
    scaleLock: Boolean(p.scaleLock),
    snap: SNAPS.includes(p.snap) ? p.snap : '1/16',
    metronome: Boolean(p.metronome),
    loop: { on: Boolean(p.loop?.on), start: loopStart, end: Math.max(loopStart + 0.25, n(p.loop?.end, 0, 4096, 16)) },
    tracks,
    master: {
      gain: n(p.master?.gain, -60, 6, 0),
      fx: (Array.isArray(p.master?.fx) ? p.master.fx : []).map(normalizeEffect).filter(Boolean).slice(0, 8),
      limiter: { on: p.master?.limiter?.on !== false, ceiling: n(p.master?.limiter?.ceiling, -12, 0, -1), release: n(p.master?.limiter?.release, 1, 1000, 80) },
    },
    assets: normalizeAssets(p.assets),
  };
}

/** A new project with a synth track carrying a short demo phrase, so the window is never empty. */
export function starterProject() {
  const chord = (t, ps) => ps.map(p => ({ p, t, d: 1.75, v: 0.7 }));
  const keysFx = [newEffect('eq'), newEffect('compressor'), { ...newEffect('reverb'), params: { ...newEffect('reverb').params, mix: 22 } }];
  return normalizeProject({
    title: 'First idea',
    bpm: 96,
    key: 9,
    scale: 'minor',
    tracks: [
      { id: 'track-keys', name: 'Keys', kind: 'synth', synth: { preset: 'keys' }, fx: keysFx,
        clips: [{ id: 'clip-keys', start: 0, len: 8, notes: [...chord(0, [57, 60, 64]), ...chord(2, [53, 57, 60]), ...chord(4, [55, 59, 62]), ...chord(6, [52, 55, 59])] }] },
      { id: 'track-bass', name: 'Bass', kind: 'synth', synth: { preset: 'bass' }, fx: [newEffect('saturation')],
        clips: [{ id: 'clip-bass', start: 0, len: 8, notes: [33, 33, 29, 29, 31, 31, 28, 28].map((p, i) => ({ p, t: i, d: 0.75, v: 0.85 })) }] },
      { id: 'track-audio', name: 'Vocals', kind: 'audio', clips: [] },
    ],
    loop: { on: true, start: 0, end: 8 },
    master: { fx: [newEffect('eq')] },
  });
}

/** End of the last clip, in beats. */
export function projectEndBeats(project) {
  const spb = 60 / project.bpm;
  let end = 0;
  for (const t of project.tracks) {
    for (const c of t.clips) end = Math.max(end, c.kind === 'midi' ? c.start + c.len : c.start + c.dur / spb);
  }
  return end;
}
